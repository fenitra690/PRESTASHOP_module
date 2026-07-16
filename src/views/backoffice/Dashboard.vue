<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const sessionBack = db.session('admin', null)

// --- GARDE : si pas connecté, retour login ---
if (!sessionBack.value) {
  router.push('/backoffice/login')
}

// 1. La logique (JavaScript)
const saluer = () => {
  router.push('/Apropos')
}

// --- VUE ACTIVE ---
// 'commandes' | 'stock' | 'import'
const vue = ref('commandes')

// --- DONNÉES ---
const commandes = ref([]) // commandes PrestaShop
const paniers = ref([]) // paniers PrestaShop (carts)
const produits = ref([]) // produits pour le stock
const stocks = ref([]) // stock_availables
const clients = ref([]) // pour afficher les noms au lieu des IDs
const categoriesList = ref([]) // pour les noms des catégories
const chargement = ref(true)
const etatsMap = ref({})

const COULEURS_ETATS = {
  1: { couleur: '#f39c12', bg: '#fef9e7' },
  2: { couleur: '#27ae60', bg: '#eafaf1' },
  3: { couleur: '#27ae60', bg: '#eafaf1' },
  4: { couleur: '#3498db', bg: '#ebf5fb' },
  5: { couleur: '#3498db', bg: '#ebf5fb' },
  6: { couleur: '#e74c3c', bg: '#fdecea' },
  7: { couleur: '#95a5a6', bg: '#f2f3f4' },
  8: { couleur: '#e74c3c', bg: '#fdecea' },
  9: { couleur: '#f39c12', bg: '#fef9e7' },
  10: { couleur: '#8e44ad', bg: '#f5eef8' },
}

// ============================================================
// ÉTATS UTILISÉS (Demande spécifique)
// ============================================================
const ETATS = {
  cart: { label: 'Dans le panier', couleur: '#3498db', bg: '#ebf5fb' },
  2: { label: 'Paiement effectué', couleur: '#27ae60', bg: '#eafaf1' },
  6: { label: 'Annulé', couleur: '#e74c3c', bg: '#fdecea' },
}

// ============================================================
// CHARGEMENT
// ============================================================
onMounted(async () => {
  // Commandes PrestaShop
  const resCmd = await api.get('orders?display=full&sort=[id_DESC]')
  if (resCmd) {
    const raw = resCmd.orders || resCmd.prestashop?.orders?.order
    if (raw) commandes.value = Array.isArray(raw) ? raw : [raw]
  }

  // Paniers (Carts) - pour voir ce qui est "Dans le panier"
  const resCart = await api.get('carts?display=full&sort=[id_DESC]')
  if (resCart) {
    const raw = resCart.carts || resCart.prestashop?.carts?.cart
    // On ne garde que les paniers qui n'ont pas encore de commande associée
    const liste = Array.isArray(raw) ? raw : [raw]
    paniers.value = liste.filter((c) => !c.id_order || String(c.id_order) === '0')
  }

  // Clients (pour les noms)
  const resClients = await api.get('customers?display=[id,firstname,lastname]')
  if (resClients) {
    const raw = resClients.customers || resClients.prestashop?.customers?.customer
    if (raw) clients.value = Array.isArray(raw) ? raw : [raw]
  }

  // Catégories
  const resCats = await api.get('categories?display=[id,name]')
  if (resCats) {
    const raw = resCats.categories || resCats.prestashop?.categories?.category
    if (raw) categoriesList.value = Array.isArray(raw) ? raw : [raw]
  }

  // Produits
  const resProd = await api.get('products?display=full')
  if (resProd) {
    const raw = resProd.products || resProd.prestashop?.products?.product
    if (raw) produits.value = Array.isArray(raw) ? raw : [raw]
  }

  // Stocks
  const resStock = await api.get('stock_availables?display=full')
  if (resStock) {
    const raw = resStock.stock_availables || resStock.prestashop?.stock_availables?.stock_available
    if (raw) stocks.value = Array.isArray(raw) ? raw : [raw]
  }

  // Charger les vrais noms des états depuis PrestaShop
  const resEtats = await api.get('order_states?display=full')
  if (resEtats) {
    const raw = resEtats.order_states || resEtats.prestashop?.order_states?.order_state
    if (raw) {
      const liste = Array.isArray(raw) ? raw : [raw]
      for (let i = 0; i < liste.length; i++) {
        const e = liste[i]
        let nom = ''
        if (typeof e.name === 'string') nom = e.name
        else if (e.name?.language) {
          const l = e.name.language
          nom = Array.isArray(l)
            ? l[0]?.value || l[0]?.['#text'] || ''
            : l?.value || l?.['#text'] || ''
        }
        const couleurs = COULEURS_ETATS[e.id] || { couleur: '#888', bg: '#f5f5f5' }
        etatsMap.value[String(e.id)] = { label: nom || 'État ' + e.id, ...couleurs }
      }
    }
  }

  chargement.value = false
})

// ============================================================
// UTILITAIRES
// ============================================================
const getNomCategorie = (id) => {
  const cat = categoriesList.value.find((c) => String(c.id) === String(id))
  if (id === 'Inconnue') {
    return 'Catégorie N' // Affiche "Catégorie N" pour les produits sans catégorie par défaut
  }
  if (!cat) return 'Catégorie ' + id

  if (typeof cat.name === 'string') return cat.name
  if (Array.isArray(cat.name)) {
    return cat.name.find((l) => String(l.id) === '2')?.value || cat.name[0]?.value || 'Cat'
  }
  return cat.name?.value || 'Catégorie ' + id
}

// ============================================================
// UTILITAIRES
// ============================================================
// 1. Récupère le nom en Français (ID 2), sinon le premier disponible
const getNom = (p) => {
  if (!p || !p.name) return 'Produit sans nom'

  if (typeof p.name === 'string') return p.name

  if (Array.isArray(p.name)) {
    // On cherche la version française (id: "2")
    const versionFr = p.name.find((lang) => String(lang.id) === '2')
    // Si on trouve le français on l'affiche, sinon on prend le premier (anglais)
    return versionFr?.value || p.name[0]?.value || 'Produit sans nom'
  }

  return 'Produit'
}

const getImageUrl = (p) => {
  if (!p) return ''

  // L'ID du produit est directement accessible
  const idProduit = p.id

  // Les images sont directement dans p.associations.images
  const imgs = p?.associations?.images
  if (!imgs || (Array.isArray(imgs) && imgs.length === 0)) return ''

  // On récupère la première image du tableau
  const premiereImage = Array.isArray(imgs) ? imgs[0] : imgs
  const idImage = premiereImage?.id

  if (!idImage) return ''

  // On assemble l'URL finale propre
  return `/api/images/products/${idProduit}/${idImage}?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7`
}

const getStock = (idProduct) => {
  // Stock sans déclinaison (id_product_attribute = 0)
  const s = stocks.value.find(
    (s) => String(s.id_product) === String(idProduct) && String(s.id_product_attribute) === '0',
  )
  return s ? parseInt(s.quantity) || 0 : 0
}

const getStockEntry = (idProduct) => {
  return stocks.value.find(
    (s) => String(s.id_product) === String(idProduct) && String(s.id_product_attribute) === '0',
  )
}

const getClientNom = (id) => {
  if (!id || id === '0') return 'Invité'
  const c = clients.value.find((item) => String(item.id) === String(id))
  return c ? `${c.firstname} ${c.lastname}` : `Client #${id}`
}

const formatDate = (str) => {
  if (!str) return '—'
  // Parser manuellement pour éviter le décalage UTC→local de l'objet Date
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }
  const d = new Date(str)
  return isNaN(d) ? str : d.toLocaleDateString('fr-FR')
}

const formatPrix = (val) => {
  const n = parseFloat(val)
  return isNaN(n) ? '0.00 €' : n.toFixed(2) + ' €'
}

const getEtat = (idState) => {
  return (
    etatsMap.value[String(idState)] || { label: 'État ' + idState, couleur: '#888', bg: '#f5f5f5' }
  )
}

// ============================================================
// TABLEAU DE BORD : stats
// ============================================================
const statsParJour = computed(() => {
  const map = {}

  // On compte uniquement les vraies commandes pour le CA
  commandes.value.forEach((cmd) => {
    const jour = formatDate(cmd.date_add).split(' ')[0]
    if (!map[jour]) map[jour] = { jour, nb: 0, montant: 0, montantTTC: 0 }

    // On compte uniquement les commandes qui ne sont pas annulées (État 6)
    if (String(cmd.current_state) !== '6') {
      map[jour].nb++
      map[jour].montant += parseFloat(cmd.total_products) || 0
      map[jour].montantTTC += parseFloat(cmd.total_products_wt) || parseFloat(cmd.total_paid) || 0
    }
  })

  // Trier par date décroissante
  return Object.values(map).sort((a, b) => {
    const [da, ma, ya] = a.jour.split('/').map(Number)
    const [db, mb, yb] = b.jour.split('/').map(Number)
    return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da)
  })
})

const totalGeneral = computed(() => {
  let nb = 0,
    montant = 0,
    montantTTC = 0
  commandes.value.forEach((cmd) => {
    // CA global : tout sauf annulé
    if (String(cmd.current_state) !== '6') {
      nb++
      montant += parseFloat(cmd.total_products) || 0
      montantTTC += parseFloat(cmd.total_products_wt) || parseFloat(cmd.total_paid) || 0
    }
  })
  return { nb, montant: montant.toFixed(2), montantTTC: montantTTC.toFixed(2) }
})

// ============================================================
// TABLEAU DE BORD : STATISTIQUES AVANCÉES
// ============================================================
const statistiquesData = computed(() => {
  let venteTotalHT = 0
  let venteTotalTTC = 0
  let achatTotalHT = 0
  let stockValeurAchat = 0
  const catMap = {}

  // 1. Initialiser les catégories et la quantité disponible
  produits.value.forEach((p) => {
    const catId = p.id_category_default || 'Inconnue'
    const catNom = getNomCategorie(catId)
    if (!catMap[catId]) {
      catMap[catId] = {
        id: catId,
        nom: catNom,
        qte_physique: 0,
        qte_reserve: 0,
        qte_dispo: 0,
        benefice: 0,
      }
    }
    catMap[catId].qte_dispo += getStock(p.id)
    stockValeurAchat += getStock(p.id) * (parseFloat(p.wholesale_price) || 0)
  })

  // 2. Parcourir les commandes
  commandes.value.forEach((cmd) => {
    const etat = String(cmd.current_state)
    const isAnnulee = etat === '6'
    const isLivree = etat === '5' || etat === '2'

    const rowsRaw = cmd.associations?.order_rows?.order_row || cmd.associations?.order_rows
    if (!rowsRaw) return
    const orderRows = Array.isArray(rowsRaw) ? rowsRaw : [rowsRaw]

    orderRows.forEach((row) => {
      if (!row || !row.product_id) return

      const pId = row.product_id
      const qte = parseInt(row.product_quantity) || 0
      const p = produits.value.find((prod) => String(prod.id) === String(pId))
      const catId = p?.id_category_default || 'Inconnue'

      if (!catMap[catId]) {
        catMap[catId] = {
          id: catId,
          nom: getNomCategorie(catId),
          qte_physique: 0,
          qte_reserve: 0,
          qte_dispo: 0,
          benefice: 0,
        }
      }

      const wsPrice = p ? parseFloat(p.wholesale_price) || 0 : 0
      // Utiliser le prix HT réel de la ligne de commande et non le prix actuel du produit
      const priceHT = parseFloat(row.unit_price_tax_excl) || 0
      const priceTTC = parseFloat(row.unit_price_tax_incl) || 0

      if (isLivree) {
        // Changement : on ne compte que les commandes livrées/payées
        achatTotalHT += wsPrice * qte
        venteTotalHT += priceHT * qte
        venteTotalTTC += priceTTC * qte
      }

      const isReserve = ['1', '2', '3'].includes(etat)
      if (isReserve) {
        catMap[catId].qte_reserve += qte
      }

      if (isLivree) {
        catMap[catId].benefice += (priceHT - wsPrice) * qte
      }
    })
  })

  // 3. Post-calcul
  Object.values(catMap).forEach((cat) => {
    cat.qte_physique = cat.qte_dispo + cat.qte_reserve
  })

  const beneficeGlobal = venteTotalHT - achatTotalHT

  return {
    venteTotalHT,
    venteTotalTTC,
    achatTotalHT,
    beneficeGlobal,
    stockValeurAchat,
    margeGlobale: venteTotalHT > 0 ? (beneficeGlobal / venteTotalHT) * 100 : 0,
    categories: Object.values(catMap),
  }
})

// ============================================================
// MODIFIER L'ÉTAT D'UNE COMMANDE
// ============================================================
const modifierEtat = async (cmd, nouvelIdEtat) => {
  // Pour les états 5 (Livré) et 6 (Annulé), on utilise le module mon_order_state
  if (String(nouvelIdEtat) === '5' || String(nouvelIdEtat) === '6') {
    try {
      const url = `/index.php?fc=module&module=mon_order_state&controller=update&id_order=${cmd.id}&id_order_state=${nouvelIdEtat}`
      // On passe en POST par convention, même si l'URL porte les params
      const res = await fetch(url, { method: 'POST' })
      if (res.ok) {
        cmd.current_state = String(nouvelIdEtat)
      } else {
        alert('Erreur lors de la mise à jour via le module mon_order_state.')
      }
    } catch (e) {
      console.error(e)
      alert("Erreur réseau avec le module de changement d'état.")
    }
    return
  }

  // 1. On crée une copie de la commande pour API Native
  const payload = { ...cmd }

  // 2. On supprime les associations (lignes de produits) qui font planter le convertisseur XML
  // PrestaShop n'en a pas besoin pour un changement d'état.
  delete payload.associations

  // 3. Mise à jour de l'état
  payload.current_state = String(nouvelIdEtat)

  // DEBUG: Affichez ceci dans votre console si ça échoue encore
  console.log("Objet envoyé à l'API (sans associations):", payload)

  const res = await api.put('orders', cmd.id, payload)

  if (res) {
    // Mettre à jour localement sans recharger la page
    cmd.current_state = String(nouvelIdEtat)
  } else {
    alert("Erreur lors de la mise à jour de l'état.")
  }
}

// ============================================================
// GESTION DU STOCK
// ============================================================
const produitStockSelectionne = ref(null)
const deltaStock = ref(0)
const historiqueStock = ref([]) // simulé en localStorage
const stockHistorique = db.live('stock_historique', [])
const enCoursStock = ref(false)
const msgStock = ref('')

const ouvrirStock = (produit) => {
  produitStockSelectionne.value = produit
  deltaStock.value = 0
  msgStock.value = ''
  // Filtrer l'historique pour ce produit
  historiqueStock.value = stockHistorique.value
    .filter((h) => String(h.id_product) === String(produit.id))
    .reverse()
    .slice(0, 30)
}

const appliquerDelta = async () => {
  const p = produitStockSelectionne.value
  if (!p || deltaStock.value === 0) {
    msgStock.value = 'Entrez une quantité (positive pour ajouter, négative pour retirer).'
    return
  }
  enCoursStock.value = true
  msgStock.value = ''

  try {
    // Appel à l'endpoint custom PrestaShop
    // (le module doit être installé et exposer /api/customstock)
    const qteActuelle = getStock(p.id)
    const nouvelleQte = Math.max(0, qteActuelle + parseInt(deltaStock.value))

    // Essayer d'abord le endpoint custom (StockAvailable::updateQuantity)
    let succes = false
    try {
      const resCustom = await fetch(
        `/api/customstock?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7&id_product=${p.id}&delta=${deltaStock.value}`,
        { method: 'POST' },
      )
      if (resCustom.ok) succes = true
    } catch (e) {
      console.warn('[Stock] Endpoint custom indisponible, fallback PUT stock_availables')
    }

    // Fallback : PUT direct sur stock_availables (si l'endpoint custom n'est pas dispo)
    if (!succes) {
      const entry = getStockEntry(p.id)
      if (entry) {
        const res = await api.put('stock_availables', entry.id, {
          id_product: p.id,
          id_product_attribute: 0,
          quantity: nouvelleQte,
          depends_on_stock: 0,
          out_of_stock: 0,
        })
        if (res) succes = true
      }
    }

    if (succes) {
      // Mettre à jour localement
      const entry = stocks.value.find(
        (s) => String(s.id_product) === String(p.id) && String(s.id_product_attribute) === '0',
      )
      if (entry) entry.quantity = nouvelleQte

      // Sauvegarder dans l'historique
      const mouvement = {
        id_product: p.id,
        nom: getNom(p),
        date: new Date().toLocaleDateString('fr-FR'),
        delta: parseInt(deltaStock.value),
        quantite_apres: nouvelleQte,
        timestamp: Date.now(),
      }
      stockHistorique.value.push(mouvement)
      historiqueStock.value = stockHistorique.value
        .filter((h) => String(h.id_product) === String(p.id))
        .reverse()
        .slice(0, 30)

      msgStock.value = `✓ Stock mis à jour : ${qteActuelle} → ${nouvelleQte}`
      deltaStock.value = 0
    } else {
      msgStock.value = '⚠️ Erreur lors de la mise à jour du stock.'
    }
  } catch (e) {
    console.error(e)
    msgStock.value = '⚠️ Erreur inattendue.'
  }

  enCoursStock.value = false
}

const fermerStock = () => {
  produitStockSelectionne.value = null
}

// ============================================================
// IMPORTATION DES DONNÉES (CSV / ZIP)
// ============================================================
const fichiersImport = ref({ csv: null, images: null })
const msgImport = ref('')
const enCoursImport = ref(false)

const gererFichier = (e, type) => {
  fichiersImport.value[type] = e.target.files[0]
}

const lancerImport = async () => {
  enCoursImport.value = true
  msgImport.value =
    '⏳ Importation en cours... (Simulation de traitement des 4 fichiers CSV et du ZIP)'
  // Ici tu ajouterais ta logique de lecture CSV ou d'envoi à un script PHP
  setTimeout(() => {
    msgImport.value = '✅ Données importées avec succès dans PrestaShop.'
    enCoursImport.value = false
  }, 2000)
}

// ============================================================
// RÉINITIALISATION DES DONNÉES
// ============================================================
const reinitialiserDonnees = () => {
  if (
    confirm(
      'Voulez-vous vraiment vider toutes les données locales (sessions, historique de stock, paniers enregistrés) ? Cela vous déconnectera également.',
    )
  ) {
    localStorage.clear()
    window.location.href = '/' // Retour à l'accueil
  }
}

// ============================================================
// DÉCONNEXION
// ============================================================
const seDeconnecter = () => {
  sessionBack.value = null
  router.push('/backoffice/login')
}
</script>

<template>
  <div class="page">
    <!-- ===== SIDEBAR ===== -->
    <aside class="sidebar">
      <div class="sidebar-logo">⚙️ Admin</div>

      <nav class="sidebar-nav">
        <button
          :class="['nav-item', vue === 'commandes' ? 'actif' : '']"
          @click="vue = 'commandes'"
        >
          📋 Commandes
        </button>
        <button :class="['nav-item', vue === 'stock' ? 'actif' : '']" @click="vue = 'stock'">
          📦 Stock
        </button>
        <button
          :class="['nav-item', vue === 'statistiques' ? 'actif' : '']"
          @click="vue = 'statistiques'"
        >
          📊 Statistiques
        </button>
        <button class="nav-item" @click="$router.push('/backoffice/import')">
          📥 Import données
        </button>
      </nav>

      <div class="sidebar-footer">
        <span class="admin-nom">{{ sessionBack?.prenom }} {{ sessionBack?.nom }}</span>
        <button class="btn-deco" @click="seDeconnecter">Déconnexion</button>
        <button class="btn-reset-data" @click="reinitialiserDonnees">🧹 Vider le Storage</button>
        <button class="btn-front" @click="$router.push('/')">← Accueil</button>
      </div>
    </aside>

    <!-- ===== CONTENU PRINCIPAL ===== -->
    <main class="main">
      <!-- CHARGEMENT -->
      <div v-if="chargement" class="chargement">
        <div class="spinner"></div>
        <p>Chargement des données PrestaShop...</p>
      </div>

      <!-- ==============================
           VUE : COMMANDES
           ============================== -->
      <div v-else-if="vue === 'commandes'">
        <h1 class="titre">📋 Commandes</h1>

        <!-- STATISTIQUES PAR JOUR -->
        <div class="stats-grid">
          <div class="stat-card total">
            <span class="stat-label">Total commandes</span>
            <span class="stat-val">{{ totalGeneral.nb }}</span>
          </div>
          <div class="stat-card montant">
            <span class="stat-label">Chiffre d'affaires total</span>
            <span class="stat-val">{{ totalGeneral.montant }} €</span>
          </div>
          <div class="stat-card montant">
            <span class="stat-label">Chiffre d'affaires TTC</span>
            <span class="stat-val">{{ totalGeneral.montantTTC }} €</span>
          </div>
        </div>

        <!-- TABLEAU PAR JOUR -->
        <div class="section">
          <h2 class="section-titre">Activité par jour</h2>
          <div class="tableau-wrapper">
            <table class="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Nb commandes</th>
                  <th>Montant total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="statsParJour.length === 0">
                  <td colspan="3" class="vide-cell">Aucune commande.</td>
                </tr>
                <tr v-for="stat in statsParJour" :key="stat.jour">
                  <td>{{ stat.jour }}</td>
                  <td>{{ stat.nb }}</td>
                  <td>{{ stat.montant.toFixed(2) }} €</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- LISTE UNIQUE DES VENTES (COMMANDES + PANIERS) -->
        <div class="section">
          <h2 class="section-titre">Gestion des Ventes</h2>
          <div class="tableau-wrapper">
            <table class="tableau">
              <thead>
                <tr>
                  <th>Type / ID</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Total</th>
                  <th>État</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <!-- Les Paniers d'abord -->
                <tr v-for="cart in paniers" :key="'cart-' + cart.id">
                  <td>
                    <span class="badge-type">CART #{{ cart.id }}</span>
                  </td>
                  <td>{{ formatDate(cart.date_add) }}</td>
                  <td>{{ getClientNom(cart.id_customer) }}</td>
                  <td>—</td>
                  <td>
                    <span
                      class="badge-etat"
                      :style="{ color: ETATS.cart.couleur, background: ETATS.cart.bg }"
                    >
                      {{ ETATS.cart.label }}
                    </span>
                  </td>
                  <td><small class="gris">En attente de validation</small></td>
                </tr>

                <!-- Les Commandes ensuite -->
                <tr v-for="cmd in commandes" :key="cmd.id">
                  <td>
                    <strong>CMD #{{ cmd.id }}</strong>
                  </td>
                  <td>{{ formatDate(cmd.date_add) }}</td>
                  <td>{{ getClientNom(cmd.id_customer) }}</td>
                  <td>
                    <strong>{{ formatPrix(cmd.total_paid) }}</strong>
                  </td>
                  <td>
                    <span
                      class="badge-etat"
                      :style="{
                        color: getEtat(cmd.current_state).couleur,
                        background: getEtat(cmd.current_state).bg,
                      }"
                    >
                      {{ getEtat(cmd.current_state).label || 'Inconnu' }}
                    </span>
                  </td>
                  <td>
                    <div class="actions-etat">
                      <button
                        v-if="
                          String(cmd.current_state) !== '2' &&
                          String(cmd.current_state) !== '5' &&
                          String(cmd.current_state) !== '6'
                        "
                        class="btn-etat valider"
                        @click="modifierEtat(cmd, 2)"
                      >
                        Paiement effectué
                      </button>
                      <button
                        v-if="
                          String(cmd.current_state) !== '5' && String(cmd.current_state) !== '6'
                        "
                        class="btn-etat en-attente"
                        @click="modifierEtat(cmd, 5)"
                        style="background: #3498db; color: white"
                      >
                        Livrer
                      </button>
                      <button
                        v-if="String(cmd.current_state) !== '6'"
                        class="btn-etat annuler"
                        @click="modifierEtat(cmd, 6)"
                      >
                        Annuler
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ==============================
           VUE : STOCK
           ============================== -->
      <div v-else-if="vue === 'stock'">
        <h1 class="titre">📦 Gestion du Stock</h1>
        <p class="sous-titre">
          Sélectionnez un produit pour ajouter du stock ou voir l'évolution journalière.
        </p>

        <!-- GRILLE PRODUITS -->
        <div class="produits-grid">
          <div
            v-for="p in produits"
            :key="p.id"
            :class="['produit-card', produitStockSelectionne?.id === p.id ? 'selectionne' : '']"
            @click="ouvrirStock(p)"
          >
            <div class="produit-img">
              <img
                :src="getImageUrl(p)"
                :alt="getNom(p)"
                @error="$event.target.style.opacity = '0'"
              />
            </div>
            <div class="produit-info">
              <span class="produit-nom">{{ getNom(p) }}</span>
              <span :class="['produit-stock', getStock(p.id) > 0 ? 'vert' : 'rouge']">
                Stock : {{ getStock(p.id) }}
              </span>
            </div>
          </div>
        </div>

        <!-- MODAL MODIFICATION STOCK (Overlay pour être visible partout) -->
        <div v-if="produitStockSelectionne" class="overlay" @click.self="fermerStock">
          <div class="stock-panneau">
            <div class="stock-panneau-header">
              <h2>{{ getNom(produitStockSelectionne) }}</h2>
              <button class="btn-fermer" @click="fermerStock">✕</button>
            </div>

            <p class="stock-actuel">
              Stock actuel :
              <strong :class="getStock(produitStockSelectionne.id) > 0 ? 'vert' : 'rouge'">
                {{ getStock(produitStockSelectionne.id) }} unités
              </strong>
            </p>

            <!-- CONTRÔLE DELTA -->
            <div class="delta-ctrl">
              <label class="delta-label">
                Quantité à ajouter / retirer
                <span class="delta-note">(négatif pour retirer)</span>
              </label>
              <div class="delta-row">
                <button class="btn-delta" @click="deltaStock -= 1">−</button>
                <input v-model.number="deltaStock" type="number" class="input-delta" />
                <button class="btn-delta" @click="deltaStock += 1">+</button>
              </div>
              <p v-if="deltaStock !== 0" class="delta-preview">
                Nouveau stock prévu :
                <strong>{{
                  Math.max(0, getStock(produitStockSelectionne.id) + deltaStock)
                }}</strong>
              </p>
            </div>

            <p
              v-if="msgStock"
              :class="['msg-stock', msgStock.startsWith('✓') ? 'succes' : 'erreur']"
            >
              {{ msgStock }}
            </p>

            <button
              class="btn-appliquer"
              :disabled="enCoursStock || deltaStock === 0"
              @click="appliquerDelta"
            >
              {{ enCoursStock ? '⏳ En cours...' : 'Appliquer la modification' }}
            </button>

            <!-- HISTORIQUE JOURNALIER -->
            <div v-if="historiqueStock.length > 0" class="historique">
              <h3>Derniers mouvements</h3>
              <table class="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mouvement</th>
                    <th>Après</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(h, i) in historiqueStock" :key="i">
                    <td>{{ h.date }}</td>
                    <td :class="h.delta > 0 ? 'vert' : 'rouge'">
                      {{ h.delta > 0 ? '+' : '' }}{{ h.delta }}
                    </td>
                    <td>{{ h.quantite_apres }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="vide-historique">Aucun mouvement pour ce produit.</p>
          </div>
        </div>
      </div>

      <!-- ==============================
           VUE : IMPORTATION
           ============================== -->
      <!-- ==============================
           VUE : STATISTIQUES
           ============================== -->
      <div v-else-if="vue === 'statistiques'">
        <h1 class="titre">📊 Statistiques Commerciales</h1>

        <!-- Kpi / Totaux HT -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Total Vente HT</span>
            <span class="stat-val">{{ statistiquesData.venteTotalHT.toFixed(2) }} €</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Total Vente TTC</span>
            <span class="stat-val">{{ statistiquesData.venteTotalTTC.toFixed(2) }} €</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Total Achat HT</span>
            <span class="stat-val">{{ statistiquesData.achatTotalHT.toFixed(2) }} €</span>
          </div>
          <div class="stat-card total">
            <span class="stat-label">Bénéfice Global</span>
            <span class="stat-val">{{ statistiquesData.beneficeGlobal.toFixed(2) }} €</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Marge Globale</span>
            <span class="stat-val" :class="statistiquesData.margeGlobale > 20 ? 'vert' : 'orange'">
              {{ statistiquesData.margeGlobale.toFixed(1) }} %
            </span>
          </div>
          <div class="stat-card montant">
            <span class="stat-label">Valeur Stock (Achat)</span>
            <span class="stat-val">{{ statistiquesData.stockValeurAchat.toFixed(2) }} €</span>
          </div>
        </div>

        <!-- Tableau par catégorie -->
        <div class="section">
          <h2 class="section-titre">Détails Stocks & Bénéfices par catégorie</h2>
          <div class="tableau-wrapper">
            <table class="tableau">
              <thead>
                <tr>
                  <th>Catégorie / ID</th>
                  <th>Qté physique</th>
                  <th>Qté réservée (Cmd en cours)</th>
                  <th>Qté disponible</th>
                  <th>Bénéfice (Livrées)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cat in statistiquesData.categories" :key="cat.id">
                  <td>
                    <strong>{{ cat.nom }}</strong>
                  </td>
                  <td>{{ cat.qte_physique }}</td>
                  <td class="badge-type">{{ cat.qte_reserve }}</td>
                  <td :class="cat.qte_dispo > 0 ? 'vert' : 'rouge'">
                    <strong>{{ cat.qte_dispo }}</strong>
                  </td>
                  <td>
                    <strong>{{ cat.benefice.toFixed(2) }} €</strong>
                  </td>
                </tr>
                <tr v-if="statistiquesData.categories.length === 0">
                  <td colspan="5" class="vide-cell">Aucune donnée de catégorie disponible.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else-if="vue === 'import'">
        <h1 class="titre">📥 Importation des données</h1>
        <div class="section">
          <h2 class="section-titre">Importer les fichiers de mai 2026</h2>
          <p class="sous-titre">Sélectionnez les 3 fichiers CSV et le fichier images.zip</p>

          <div class="import-form">
            <div class="champ">
              <label>Fichiers CSV (Données produits, déclinaisons, etc.)</label>
              <input type="file" multiple accept=".csv" @change="(e) => gererFichier(e, 'csv')" />
            </div>

            <div class="champ">
              <label>Fichier Images (images.zip)</label>
              <input type="file" accept=".zip" @change="(e) => gererFichier(e, 'images')" />
            </div>

            <div
              v-if="msgImport"
              :class="['msg-stock', msgImport.includes('✅') ? 'succes' : 'info']"
            >
              {{ msgImport }}
            </div>

            <button class="btn-appliquer" :disabled="enCoursImport" @click="lancerImport">
              {{ enCoursImport ? 'Traitement...' : "Lancer l'importation" }}
            </button>
          </div>

          <div class="note-import">
            <p>
              <strong>Note :</strong> L'importation mettra à jour les produits et les stocks
              existants dans PrestaShop.
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped src="@/assets/Back/Dashboard.css"></style>
