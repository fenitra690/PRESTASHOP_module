<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const panier = db.live('panier', [])
const mesCommandes = db.live('mes_commandes', [])
const session = db.session('utilisateur', null)

// ============================================================
// ÉTAPES : 1=Identité  2=Adresse  3=Transporteur  4=Paiement  5=Confirmation
// ============================================================
const etape = ref(1)

// --- ÉTAPE 1 : Identité ---
const identite = ref({
  civilite: '1',
  prenom: session.value?.prenom || '',
  nom: session.value?.nom || '',
  email: session.value?.email || '',
})

// --- ÉTAPE 2 : Adresse ---
const adresse = ref({
  adresse1: '',
  ville: '',
  code_postal: '',
  telephone: '',
})

const adressesExistantes = ref([])
const adresseChoisieId = ref(null)
const chargementAdresses = ref(false)

onMounted(async () => {
  if (session.value && !session.value.anonyme && session.value.id) {
    chargementAdresses.value = true
    const res = await api.get(`addresses?filter[id_customer]=${session.value.id}&display=full`)
    if (res) {
      const raw = res.addresses || res.prestashop?.addresses?.address
      if (raw) {
        adressesExistantes.value = Array.isArray(raw) ? raw : [raw]
        if (adressesExistantes.value.length > 0) {
          choisirAdresse(adressesExistantes.value[0])
        }
      }
    }
    chargementAdresses.value = false
  }
})

const choisirAdresse = (a) => {
  adresseChoisieId.value = a.id
  adresse.value.adresse1 = a.address1 || ''
  adresse.value.ville = a.city || ''
  adresse.value.code_postal = a.postcode || ''
  adresse.value.telephone = a.phone_mobile || a.phone || ''
}

// --- ÉTAPE 3 : Transporteur ---
const transporteurs = ref([
  { id: 1, nom: 'Click and collect', description: 'Retrait en magasin', prix: 0 },
  { id: 2, nom: 'My carrier', description: 'Livraison le lendemain !', prix: 8.4 },
])
const transporteurChoisi = ref(1)

// --- ÉTAPE 4 : Paiement ---
const modesPaiement = ref([
  {
    id: 'ps_cashondelivery',
    nom: 'Paiement à la livraison',
    icone: '🚚',
    description: 'Réglez en espèces à la réception.',
  },
  {
    id: 'ps_wirepayment',
    nom: 'Virement bancaire',
    icone: '🏦',
    description: 'Effectuez un virement sur notre compte bancaire.',
  },
])
const paiementChoisi = ref('ps_cashondelivery')

// --- CALCULS ---
const sousTotal = computed(() => {
  let t = 0
  for (let i = 0; i < panier.value.length; i++) t += panier.value[i].prix * panier.value[i].quantite
  return t
})
const fraisLivraison = computed(() => {
  const t = transporteurs.value.find((t) => t.id === transporteurChoisi.value)
  return t ? t.prix : 0
})
const total = computed(() => (sousTotal.value + fraisLivraison.value).toFixed(2))

const erreur = ref('')
const enCours = ref(false)
const debugLog = ref([]) // Pour voir ce qui se passe en cas d'erreur

// Utilitaire pour extraire l'ID de manière sûre (gère CDATA et objets)
const extraireId = (obj) => {
  if (!obj) return null
  if (typeof obj === 'object') {
    return obj.id?.__cdata || obj.id?.['#text'] || obj.id || null
  }
  return obj
}

// ============================================================
// VALIDATIONS PAR ÉTAPE
// ============================================================
const validerEtape1 = () => {
  erreur.value = ''
  if (!identite.value.prenom.trim() || !identite.value.nom.trim()) {
    erreur.value = 'Veuillez remplir prénom et nom.'
    return
  }
  if (!session.value || session.value.anonyme) {
    if (!identite.value.email.trim()) {
      erreur.value = 'Veuillez entrer votre email.'
      return
    }
  }
  etape.value = 2
}

const validerEtape2 = () => {
  erreur.value = ''
  if (
    !adresse.value.adresse1.trim() ||
    !adresse.value.ville.trim() ||
    !adresse.value.code_postal.trim()
  ) {
    erreur.value = 'Veuillez remplir adresse, code postal et ville.'
    return
  }
  etape.value = 3
}

// ============================================================
// COMMANDE FINALE
// api.post() gère lui-même le schema=blank + XML
// ============================================================
const passerCommande = async () => {
  erreur.value = ''
  enCours.value = true
  debugLog.value = []

  try {
    const idClient = session.value && !session.value.anonyme ? session.value.id : 1
    const transporteurSelectionne = transporteurs.value.find(
      (t) => t.id === transporteurChoisi.value,
    )
    const paiementSelectionne = modesPaiement.value.find((p) => p.id === paiementChoisi.value)

    // ---- ÉTAPE A : Créer ou réutiliser une adresse ----
    let idAdresse = adresseChoisieId.value

    if (!idAdresse) {
      debugLog.value.push('Création adresse...')
      const resAddr = await api.post('addresses', {
        id_customer: idClient,
        id_country: 8, // France (ID 8 dans PrestaShop par défaut)
        alias: 'Commande',
        firstname: identite.value.prenom,
        lastname: identite.value.nom,
        address1: adresse.value.adresse1,
        city: adresse.value.ville,
        postcode: adresse.value.code_postal,
        phone_mobile: adresse.value.telephone || '0600000000',
      })

      if (!resAddr) {
        erreur.value =
          "Impossible de créer l'adresse. Vérifiez les champs (tous les champs doivent être valides pour PrestaShop)."
        enCours.value = false
        return
      }

      idAdresse = extraireId(resAddr.prestashop?.address || resAddr.address)
      debugLog.value.push('Adresse creee, ID: ' + idAdresse)
    } else {
      debugLog.value.push('Adresse réutilisée, ID: ' + idAdresse)
    }

    if (!idAdresse) {
      erreur.value = 'Adresse créée mais ID introuvable dans la réponse PrestaShop.'
      enCours.value = false
      return
    }

    // ---- ÉTAPE B : Créer un panier PrestaShop AVEC les produits ----
    // C'est le seul moyen pour que PrestaShop décrémente le stock correctement
    debugLog.value.push('Création panier avec produits...')

    // Construire les cart_rows depuis notre panier local
    const cartRows = []
    for (let i = 0; i < panier.value.length; i++) {
      const art = panier.value[i]
      cartRows.push({
        id_product: art.id,
        id_product_attribute: 0, // 0 = pas de déclinaison spécifique
        quantity: art.quantite,
        id_address_delivery: idAdresse,
      })
    }

    const resPanier = await api.post('carts', {
      id_customer: idClient,
      id_address_delivery: idAdresse,
      id_address_invoice: idAdresse,
      id_currency: 1,
      id_lang: 1,
      id_carrier: transporteurChoisi.value,
      associations: {
        cart_rows: {
          nodeType: 'cart_row',
          rows: cartRows,
        },
      },
    })

    if (!resPanier) {
      erreur.value = 'Impossible de créer le panier PrestaShop.'
      enCours.value = false
      return
    }

    const idPanier = extraireId(resPanier.prestashop?.cart || resPanier.cart)
    debugLog.value.push('Panier cree, ID: ' + idPanier)

    // ---- ÉTAPE C : Créer la commande PrestaShop ----
    let idCommande = null
    if (idPanier) {
      debugLog.value.push('Création commande...')
      const resCmd = await api.post('orders', {
        id_address_delivery: idAdresse,
        id_address_invoice: idAdresse,
        id_cart: idPanier,
        id_currency: 1,
        id_lang: 1,
        id_customer: idClient,
        id_carrier: transporteurChoisi.value,
        module: paiementChoisi.value,
        payment: paiementSelectionne?.nom || 'Paiement à la livraison',
        total_paid: parseFloat(total.value),
        total_paid_real: 0,
        total_products: parseFloat(sousTotal.value.toFixed(2)),
        total_products_wt: parseFloat(sousTotal.value.toFixed(2)),
        total_shipping: fraisLivraison.value,
        total_shipping_tax_excl: fraisLivraison.value,
        total_shipping_tax_incl: fraisLivraison.value,
        current_state: 1,
        conversion_rate: 1,
      })

      idCommande = extraireId(resCmd?.prestashop?.order || resCmd?.order)
      debugLog.value.push('Commande creee, ID: ' + idCommande)
    }

    // ---- ÉTAPE D : Décrémenter le stock dans stock_availables ----
    // L'état 1 (En attente) ne décrémente pas le stock automatiquement dans PS
    // On le fait manuellement via l'API stock_availables
    debugLog.value.push('Mise à jour des stocks...')
    for (let i = 0; i < panier.value.length; i++) {
      const art = panier.value[i]
      try {
        // 1. Trouver le stock_available pour ce produit (sans déclinaison = id_product_attribute 0)
        const resStock = await api.get(
          'stock_availables?filter[id_product]=' +
            art.id +
            '&filter[id_product_attribute]=0&display=full',
        )
        let stockEntry = null
        if (resStock) {
          const raw =
            resStock.stock_availables || resStock.prestashop?.stock_availables?.stock_available
          if (raw) {
            const liste = Array.isArray(raw) ? raw : [raw]
            stockEntry = liste[0]
          }
        }

        if (stockEntry && stockEntry.id) {
          const nouvelleQte = Math.max(0, parseInt(stockEntry.quantity) - art.quantite)
          await api.put('stock_availables', stockEntry.id, {
            id_product: art.id,
            id_product_attribute: 0,
            quantity: nouvelleQte,
            depends_on_stock: 0,
            out_of_stock: 0,
          })
          debugLog.value.push(
            'Stock ' + art.nom + ' : ' + stockEntry.quantity + ' -> ' + nouvelleQte,
          )
        }
      } catch (e) {
        console.warn('[Stock] Erreur mise à jour stock produit ' + art.id, e)
      }
    }

    // ---- ÉTAPE E : Sauvegarder localement ----
    mesCommandes.value.push({
      id: idCommande || 'local-' + Date.now(),
      ref: 'CMD-' + Date.now(),
      date: new Date().toLocaleDateString('fr-FR'),
      articles: [...panier.value],
      sous_total: sousTotal.value.toFixed(2),
      livraison: fraisLivraison.value.toFixed(2),
      total: total.value,
      transporteur: transporteurSelectionne?.nom || '',
      paiement: paiementSelectionne?.nom || '',
      adresse: {
        ...adresse.value,
        prenom: identite.value.prenom,
        nom: identite.value.nom,
      },
      statut: 'En attente de livraison',
    })

    // ---- ÉTAPE G : Vider le panier ----
    panier.value = []
    etape.value = 5
  } catch (e) {
    console.error('[Payment] Erreur inattendue:', e)
    erreur.value = 'Erreur inattendue : ' + (e.message || 'voir la console')
  }

  enCours.value = false
}

const nomEtapes = ['', 'Identité', 'Adresse', 'Livraison', 'Paiement', '']
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <header class="header">
      <div class="header-int">
        <button class="btn-retour" @click="router.push('/frontoffice/Panier')">← Panier</button>
        <span class="logo">🛍️ Ma Boutique — Commande</span>
        <span></span>
      </div>
    </header>

    <!-- BREADCRUMB ÉTAPES -->
    <div v-if="etape < 5" class="etapes-bar">
      <div
        v-for="n in [1, 2, 3, 4]"
        :key="n"
        :class="['etape', etape === n ? 'active' : '', etape > n ? 'done' : '']"
      >
        <span class="etape-num">{{ etape > n ? '✓' : n }}</span>
        <span class="etape-label">{{ nomEtapes[n] }}</span>
      </div>
    </div>

    <main class="contenu">
      <!-- ===== CONFIRMATION ===== -->
      <div v-if="etape === 5" class="confirmation">
        <div class="confbox">
          <div class="conf-icone">✅</div>
          <h2>Commande confirmée !</h2>
          <p>Merci pour votre commande. Vous serez livré(e) prochainement.</p>
          <div class="conf-boutons">
            <button class="btn-primaire" @click="router.push('/frontoffice/MesCommandes')">
              Voir mes commandes
            </button>
            <button class="btn-sec" @click="router.push('/frontoffice/ListProduct')">
              Retour à la boutique
            </button>
          </div>
        </div>
      </div>

      <div v-else class="checkout-layout">
        <!-- === FORMULAIRES === -->
        <div class="formulaires">
          <!-- ÉTAPE 1 : IDENTITÉ -->
          <div v-if="etape === 1" class="bloc">
            <h2 class="bloc-titre"><span class="num">1</span> Vos informations</h2>

            <!-- Client connecté -->
            <div v-if="session && !session.anonyme" class="info-connecte">
              <span class="badge-vert">✓ Connecté</span>
              <strong>{{ session.prenom }} {{ session.nom }}</strong>
              <span class="gris">{{ session.email }}</span>
            </div>

            <!-- Invité : choix -->
            <div v-else class="choix-mode">
              <span class="mode-actif">Commander en tant qu'invité</span>
              <span class="mode-sep">|</span>
              <button class="btn-lien" @click="router.push('/UserLog')">Connexion</button>
            </div>

            <!-- Civilité -->
            <div class="champ">
              <label>Civilité</label>
              <div class="radios">
                <label class="radio"
                  ><input type="radio" v-model="identite.civilite" value="1" /> M.</label
                >
                <label class="radio"
                  ><input type="radio" v-model="identite.civilite" value="2" /> Mme</label
                >
              </div>
            </div>

            <div class="champ-groupe">
              <div class="champ">
                <label>Prénom *</label>
                <input v-model="identite.prenom" placeholder="Votre prénom" />
              </div>
              <div class="champ">
                <label>Nom *</label>
                <input v-model="identite.nom" placeholder="Votre nom" />
              </div>
            </div>

            <div v-if="!session || session.anonyme" class="champ">
              <label>E-mail *</label>
              <input v-model="identite.email" type="email" placeholder="votre@email.com" />
            </div>

            <p v-if="erreur" class="erreur">⚠️ {{ erreur }}</p>
            <button class="btn-suivant" @click="validerEtape1">Continuer →</button>
          </div>

          <!-- ÉTAPE 2 : ADRESSE -->
          <div v-if="etape === 2" class="bloc">
            <h2 class="bloc-titre"><span class="num">2</span> Mon adresse</h2>

            <div v-if="chargementAdresses" class="chargement-mini">⏳ Chargement...</div>

            <!-- Adresses existantes -->
            <div v-if="adressesExistantes.length > 0">
              <p class="label-section">Adresses enregistrées :</p>
              <div
                v-for="a in adressesExistantes"
                :key="a.id"
                :class="['addr-card', adresseChoisieId == a.id ? 'actif' : '']"
                @click="choisirAdresse(a)"
              >
                <strong>{{ a.firstname }} {{ a.lastname }}</strong
                ><br />
                {{ a.address1 }} — {{ a.postcode }} {{ a.city }}
              </div>
              <p class="label-section">Ou saisir une nouvelle :</p>
            </div>

            <div class="champ">
              <label>Adresse *</label>
              <input v-model="adresse.adresse1" placeholder="N° et nom de rue" />
            </div>
            <div class="champ-groupe">
              <div class="champ">
                <label>Code postal *</label>
                <input v-model="adresse.code_postal" placeholder="75000" />
              </div>
              <div class="champ">
                <label>Ville *</label>
                <input v-model="adresse.ville" placeholder="Paris" />
              </div>
            </div>
            <div class="champ">
              <label>Téléphone</label>
              <input v-model="adresse.telephone" placeholder="0600000000" />
            </div>

            <p v-if="erreur" class="erreur">⚠️ {{ erreur }}</p>
            <div class="boutons-nav">
              <button class="btn-retour-etape" @click="etape = 1">← Retour</button>
              <button class="btn-suivant" @click="validerEtape2">Continuer →</button>
            </div>
          </div>

          <!-- ÉTAPE 3 : TRANSPORTEUR -->
          <div v-if="etape === 3" class="bloc">
            <h2 class="bloc-titre"><span class="num">3</span> Mode de livraison</h2>

            <div
              v-for="t in transporteurs"
              :key="t.id"
              :class="['transport-card', transporteurChoisi === t.id ? 'actif' : '']"
              @click="transporteurChoisi = t.id"
            >
              <div :class="['radio-cercle', transporteurChoisi === t.id ? 'actif' : '']"></div>
              <div class="transport-info">
                <strong>{{ t.nom }}</strong>
                <p>{{ t.description }}</p>
              </div>
              <span class="transport-prix">{{
                t.prix === 0 ? 'Gratuit' : t.prix.toFixed(2) + ' € TTC'
              }}</span>
            </div>

            <div class="boutons-nav">
              <button class="btn-retour-etape" @click="etape = 2">← Retour</button>
              <button class="btn-suivant" @click="etape = 4">Continuer →</button>
            </div>
          </div>

          <!-- ÉTAPE 4 : PAIEMENT -->
          <div v-if="etape === 4" class="bloc">
            <h2 class="bloc-titre"><span class="num">4</span> Mode de paiement</h2>

            <div
              v-for="p in modesPaiement"
              :key="p.id"
              :class="['transport-card', paiementChoisi === p.id ? 'actif' : '']"
              @click="paiementChoisi = p.id"
            >
              <div :class="['radio-cercle', paiementChoisi === p.id ? 'actif' : '']"></div>
              <span class="paiement-icone">{{ p.icone }}</span>
              <div class="transport-info">
                <strong>{{ p.nom }}</strong>
                <p>{{ p.description }}</p>
              </div>
            </div>

            <!-- LOG DE DEBUG (visible seulement en cas d'erreur) -->
            <div v-if="erreur" class="erreur-bloc">
              <p class="erreur">⚠️ {{ erreur }}</p>
              <details>
                <summary style="cursor: pointer; color: #888; font-size: 0.8rem">
                  Détails techniques
                </summary>
                <ul style="font-size: 0.78rem; color: #666; margin-top: 8px">
                  <li v-for="(log, i) in debugLog" :key="i">{{ log }}</li>
                </ul>
              </details>
            </div>

            <div class="boutons-nav">
              <button class="btn-retour-etape" @click="etape = 3">← Retour</button>
              <button class="btn-commander" :disabled="enCours" @click="passerCommande">
                {{ enCours ? '⏳ Traitement...' : '✓ Confirmer la commande' }}
              </button>
            </div>
          </div>
        </div>

        <!-- === RÉCAP COMMANDE === -->
        <div class="recap">
          <h2>Votre commande</h2>

          <div v-for="art in panier" :key="art.id + art.taille + art.couleur" class="recap-art">
            <div class="recap-img">
              <img :src="art.image" :alt="art.nom" @error="$event.target.style.opacity = '0'" />
            </div>
            <div class="recap-art-info">
              <span>{{ art.nom }} × {{ art.quantite }}</span>
              <span v-if="art.taille" class="recap-tag">{{ art.taille }}</span>
              <span v-if="art.couleur" class="recap-tag">{{ art.couleur }}</span>
            </div>
            <span class="recap-art-prix">{{ (art.prix * art.quantite).toFixed(2) }} €</span>
          </div>

          <div class="recap-sep"></div>
          <div class="recap-ligne">
            <span>Sous-total</span>
            <span>{{ sousTotal.toFixed(2) }} €</span>
          </div>
          <div class="recap-ligne">
            <span>Livraison</span>
            <span>{{ fraisLivraison === 0 ? 'Gratuite' : fraisLivraison.toFixed(2) + ' €' }}</span>
          </div>
          <div class="recap-sep"></div>
          <div class="recap-total">
            <span>Total TTC</span>
            <span>{{ total }} €</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped src="@/assets/Front/Payment.css"></style>
