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

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

.page {
  min-height: 100vh;
  background: #f8f6f1;
  font-family: 'Lato', sans-serif;
}

.header {
  background: #1a1a2e;
  padding: 0 30px;
}
.header-int {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}
.logo {
  font-family: 'Playfair Display', serif;
  color: white;
  font-size: 1.1rem;
}
.btn-retour {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 7px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-retour:hover {
  background: rgba(255, 255, 255, 0.1);
}

.etapes-bar {
  background: white;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: center;
}
.etape {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 28px;
  color: #bbb;
  font-size: 0.85rem;
  border-bottom: 3px solid transparent;
}
.etape.active {
  color: #1a1a2e;
  border-bottom-color: #e94560;
}
.etape.done {
  color: #27ae60;
}
.etape-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 700;
}
.etape.done .etape-num {
  background: #27ae60;
  color: white;
  border-color: #27ae60;
}
.etape.active .etape-num {
  background: #e94560;
  color: white;
  border-color: #e94560;
}
.etape-label {
  display: none;
}
@media (min-width: 500px) {
  .etape-label {
    display: block;
  }
}

.contenu {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 20px;
}
.checkout-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 30px;
  align-items: start;
}
@media (max-width: 780px) {
  .checkout-layout {
    grid-template-columns: 1fr;
  }
}

.bloc {
  background: white;
  border-radius: 14px;
  padding: 28px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.bloc-titre {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'Playfair Display', serif;
  font-size: 1.3rem;
  color: #1a1a2e;
  margin: 0 0 24px;
}
.num {
  background: #e94560;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: 'Lato', sans-serif;
  flex-shrink: 0;
}

.info-connecte {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f0f9f0;
  border: 1px solid #c3e6cb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.badge-vert {
  background: #27ae60;
  color: white;
  font-size: 0.75rem;
  padding: 3px 10px;
  border-radius: 10px;
}
.gris {
  color: #888;
  font-size: 0.88rem;
}
.choix-mode {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.mode-actif {
  color: #e94560;
  font-weight: 700;
  font-size: 0.92rem;
}
.mode-sep {
  color: #ddd;
}
.btn-lien {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 0.92rem;
  text-decoration: underline;
}

.radios {
  display: flex;
  gap: 20px;
  margin-top: 8px;
}
.radio {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.92rem;
  color: #555;
}
.champ-groupe {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}
.champ {
  margin-bottom: 15px;
}
.champ label {
  display: block;
  color: #555;
  font-size: 0.85rem;
  margin-bottom: 5px;
}
.champ input {
  width: 100%;
  padding: 10px 13px;
  border: 1.5px solid #ddd;
  border-radius: 8px;
  font-size: 0.92rem;
  box-sizing: border-box;
}
.champ input:focus {
  outline: none;
  border-color: #1a1a2e;
}

.chargement-mini {
  color: #888;
  font-size: 0.85rem;
  margin-bottom: 12px;
}
.label-section {
  color: #1a1a2e;
  font-weight: 700;
  font-size: 0.85rem;
  margin: 12px 0 8px;
}
.addr-card {
  border: 1.5px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  font-size: 0.88rem;
  color: #444;
  line-height: 1.5;
  margin-bottom: 8px;
}
.addr-card.actif {
  border-color: #e94560;
  background: #fff8f9;
}
.addr-card:hover {
  border-color: #1a1a2e;
}

.transport-card {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1.5px solid #ddd;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: border-color 0.15s;
}
.transport-card.actif {
  border-color: #e94560;
  background: #fff8f9;
}
.radio-cercle {
  width: 18px;
  height: 18px;
  border: 2px solid #ddd;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.15s;
}
.radio-cercle.actif {
  border-color: #e94560;
  background: #e94560;
  box-shadow: inset 0 0 0 3px white;
}
.transport-info {
  flex: 1;
}
.transport-info strong {
  display: block;
  color: #1a1a2e;
  font-size: 0.95rem;
}
.transport-info p {
  margin: 3px 0 0;
  color: #888;
  font-size: 0.82rem;
}
.transport-prix {
  font-weight: 700;
  color: #1a1a2e;
  white-space: nowrap;
}
.paiement-icone {
  font-size: 1.6rem;
  flex-shrink: 0;
}

.erreur {
  color: #e94560;
  background: #fff0f2;
  border: 1px solid #fcc;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.88rem;
}
.erreur-bloc {
  margin-top: 12px;
}

.boutons-nav {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
}
.btn-retour-etape {
  background: white;
  border: 1px solid #ddd;
  color: #555;
  padding: 11px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-retour-etape:hover {
  background: #f5f5f5;
}
.btn-suivant {
  background: #1a1a2e;
  color: white;
  border: none;
  padding: 11px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.92rem;
  font-weight: 700;
}
.btn-suivant:hover {
  background: #2d2d4e;
}
.btn-commander {
  background: #e94560;
  color: white;
  border: none;
  padding: 13px 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
}
.btn-commander:hover:not(:disabled) {
  background: #c73652;
}
.btn-commander:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* RÉCAP */
.recap {
  background: white;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  position: sticky;
  top: 20px;
}
.recap h2 {
  font-family: 'Playfair Display', serif;
  font-size: 1.2rem;
  color: #1a1a2e;
  margin: 0 0 16px;
}
.recap-art {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}
.recap-img {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  background: #f0ece4;
  overflow: hidden;
  flex-shrink: 0;
}
.recap-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.recap-art-info {
  flex: 1;
  font-size: 0.82rem;
  color: #444;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.recap-tag {
  font-size: 0.72rem;
  background: #f0ece4;
  color: #888;
  padding: 1px 6px;
  border-radius: 8px;
  width: fit-content;
}
.recap-art-prix {
  font-weight: 700;
  font-size: 0.9rem;
  color: #1a1a2e;
  white-space: nowrap;
}
.recap-sep {
  height: 8px;
}
.recap-ligne {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  color: #666;
  font-size: 0.88rem;
}
.recap-total {
  display: flex;
  justify-content: space-between;
  padding: 12px 0 0;
  font-weight: 700;
  font-size: 1.1rem;
  color: #1a1a2e;
  border-top: 1.5px solid #eee;
}

/* CONFIRMATION */
.confirmation {
  display: flex;
  justify-content: center;
  padding: 60px 20px;
}
.confbox {
  background: white;
  border-radius: 20px;
  padding: 50px;
  max-width: 460px;
  width: 100%;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.1);
}
.conf-icone {
  font-size: 4rem;
  margin-bottom: 16px;
}
.confbox h2 {
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  color: #1a1a2e;
  margin: 0 0 12px;
}
.confbox p {
  color: #555;
  font-size: 0.95rem;
  margin-bottom: 8px;
}
.conf-boutons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
}
.btn-primaire {
  background: #e94560;
  color: white;
  border: none;
  padding: 14px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
}
.btn-primaire:hover {
  background: #c73652;
}
.btn-sec {
  background: white;
  border: 1px solid #ddd;
  color: #555;
  padding: 13px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.95rem;
}
.btn-sec:hover {
  background: #f5f5f5;
}
</style>
