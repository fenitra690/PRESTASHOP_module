<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const session = db.session('utilisateur', null)
const panier = db.live('panier', [])

// --- DONNÉES ---
const tousLesProduits = ref([])
const tousLesStocks = ref([])
const categories = ref([])
const chargement = ref(true)

// --- FICHE PRODUIT ---
const produitOuvert = ref(null)
const combinaisons = ref([]) // les déclinaisons (tailles/couleurs)
const attributs = ref([]) // les options (ex: Taille, Couleur)
const tailleChoisie = ref('')
const couleurChoisie = ref('')
const quantiteChoisie = ref(1)
const chargementFiche = ref(false)

// --- RECHERCHE ---
const recherche = ref('')
const categorieChoisie = ref('')
const prixMin = ref('')
const prixMax = ref('')

// ============================================================
// CHARGEMENT INITIAL
// ============================================================
onMounted(async () => {
  // Produits
  const resProd = await api.get('products?display=full')
  if (resProd) {
    const raw = resProd.products || resProd.prestashop?.products?.product
    if (raw) tousLesProduits.value = Array.isArray(raw) ? raw : [raw]
  }

  // Catégories
  const resCat = await api.get('categories?display=full')
  if (resCat) {
    const rawCat = resCat.categories || resCat.prestashop?.categories?.category
    if (rawCat) {
      const liste = Array.isArray(rawCat) ? rawCat : [rawCat]
      // Filtrer les catégories "racine" et "Accueil" (id 1 et 2)
      categories.value = liste.filter((c) => c.id > 2)
    }
  }

  // 3. Récupération des vrais STOCKS
  const resStock = await api.get('stock_availables?display=full');
  if (resStock != null) {
    let rawStock = resStock.stock_availables;
    if (rawStock != null) {
      if (Array.isArray(rawStock) == true) {
        tousLesStocks.value = rawStock;
      } else {
        tousLesStocks.value = [rawStock];
      }
    }
  }

  chargement.value = false
})

// ============================================================
// UTILITAIRES EXTRACTION
// ============================================================
const getNom = (p) => {
  if (!p.name) return 'Produit'
  if (typeof p.name === 'string') return p.name
  if (Array.isArray(p.name)) return p.name[0]?.value || p.name[0]?.['#text'] || 'Produit'
  if (p.name.language) {
    const l = p.name.language
    return Array.isArray(l)
      ? l[0]?.value || l[0]?.['#text'] || 'Produit'
      : l?.value || l?.['#text'] || 'Produit'
  }
  return 'Produit'
}

const getDescription = (p) => {
  if (!p.description_short) return ''
  if (typeof p.description_short === 'string') return p.description_short
  if (p.description_short.language) {
    const l = p.description_short.language
    const texte = Array.isArray(l)
      ? l[0]?.value || l[0]?.['#text'] || ''
      : l?.value || l?.['#text'] || ''
    // Enlever les balises HTML
    return texte.replace(/<[^>]*>/g, '')
  }
  return ''
}

const getNomCategorie = (p) => {
  if (!p.id_category_default) return ''
  const cat = categories.value.find((c) => String(c.id) === String(p.id_category_default))
  if (!cat) return ''
  if (!cat.name) return ''
  if (typeof cat.name === 'string') return cat.name
  if (cat.name.language) {
    const l = cat.name.language
    return Array.isArray(l) ? l[0]?.value || l[0]?.['#text'] || '' : l?.value || l?.['#text'] || ''
  }
  return ''
}

// Nouvelle fonction simplifiée pour extraire le vrai nom d'une catégorie
function extraireNomCategorie(cat) {
  if (!cat) return ''

  // 1. Si le nom est directement une chaîne de texte
  if (typeof cat.name === 'string') {
    return cat.name
  }

  // 2. CAS DU JSON PRESTASHOP : Le nom est souvent un objet contenant "value" ou "#text"
  if (cat.name && typeof cat.name === 'object') {
    // Si PrestaShop a renvoyé une structure multi-langue avec .language
    if (cat.name.language) {
      const lang = cat.name.language
      if (Array.isArray(lang)) {
        return lang[0]?.value || lang[0]?.['#text'] || ''
      }
      return lang?.value || lang?.['#text'] || ''
    }
    
    // Si c'est directement dans l'objet name
    return cat.name.value || cat.name['#text'] || ''
  }

  return ''
}

const getImageUrl = (id, idImage) => {
  // PrestaShop : /api/images/products/{id_product}/{id_image}
  return `/api/images/products/${id}/${idImage || 1}?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7`
}

// CORRECTION IMAGES
function getPremierImage(p) {
  let idProduct = p.id;
  let idImage = "";

  // 1. On regarde si PrestaShop nous donne directement l'ID de l'image par défaut
  if (p.id_default_image != null && p.id_default_image != "") {
    idImage = p.id_default_image;
  } 
  // 2. Sinon, on fouille dans la liste des images du produit
  else if (p.associations != null && p.associations.images != null && p.associations.images.image != null) {
    let imgs = p.associations.images.image;
    if (Array.isArray(imgs) == true) {
      idImage = imgs[0].id;
    } else {
      idImage = imgs.id;
    }
  }

  // 3. Si on n'a VRAIMENT pas trouvé d'image, on ne fait pas de requête (évite l'erreur 400)
  if (idImage == "") {
    return ""; 
  }

  // On retourne la bonne URL
  return '/api/images/products/' + idProduct + '/' + idImage + '?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7';
}

const getPrix = (p) => parseFloat(p.price) || 0
const getPrixReduit = (p) => {
  // price_reduction_percent si disponible
  const reduction = parseFloat(p.reduction_percent) || 0
  if (reduction > 0) return (getPrix(p) * (1 - reduction / 100)).toFixed(2)
  return null
}

// ============================================================
// BADGE HOT / NEW
// ============================================================
const getBadge = (p) => {
  // date_add = date de création du produit dans PrestaShop
  if (!p.date_add) return null
  const dateAjout = new Date(p.date_add)
  const maintenant = new Date()
  const diffJours = (maintenant - dateAjout) / (1000 * 60 * 60 * 24)

  if (diffJours <= 1) return { label: '🔥 HOT', classe: 'badge-hot' }
  if (diffJours <= 7) return { label: '✨ NEW', classe: 'badge-new' }
  return null
}

// ============================================================
// RECHERCHE MULTICRITÈRE
// ============================================================
const produitsFiltres = computed(() => {
  let liste = tousLesProduits.value

  // Filtre par nom
  if (recherche.value.trim()) {
    const terme = recherche.value.toLowerCase()
    liste = liste.filter((p) => getNom(p).toLowerCase().includes(terme))
  }

  // Filtre par catégorie
  if (categorieChoisie.value) {
    liste = liste.filter((p) => String(p.id_category_default) === categorieChoisie.value)
  }

  // Filtre par prix min
  if (prixMin.value !== '') {
    liste = liste.filter((p) => getPrix(p) >= parseFloat(prixMin.value))
  }

  // Filtre par prix max
  if (prixMax.value !== '') {
    liste = liste.filter((p) => getPrix(p) <= parseFloat(prixMax.value))
  }

  return liste
})

const reinitialiserFiltres = () => {
  recherche.value = ''
  categorieChoisie.value = ''
  prixMin.value = ''
  prixMax.value = ''
}

// ============================================================
// FICHE PRODUIT
// ============================================================
const ouvrirFiche = async (produit) => {
  produitOuvert.value = produit
  tailleChoisie.value = ''
  couleurChoisie.value = ''
  quantiteChoisie.value = 1
  combinaisons.value = []
  attributs.value = []
  chargementFiche.value = true

  // Charger les combinaisons (déclinaisons) du produit
  const assoc = produit.associations?.combinations?.combination
  if (assoc) {
    const listeIds = Array.isArray(assoc) ? assoc : [assoc]

    // Pour chaque combinaison, charger ses détails
    const details = []
    for (let i = 0; i < listeIds.length; i++) {
      const resComb = await api.get(`combinations/${listeIds[i].id}`)
      if (resComb) {
        const c = resComb.combination || resComb.prestashop?.combination
        if (c) details.push(c)
      }
    }
    combinaisons.value = details
  }

  // Charger les options produit (pour les noms : Taille, Couleur...)
  const assocOpts = produit.associations?.product_options?.product_option
  if (assocOpts) {
    const listeOpts = Array.isArray(assocOpts) ? assocOpts : [assocOpts]
    const opts = []
    for (let i = 0; i < listeOpts.length; i++) {
      const resOpt = await api.get(`product_options/${listeOpts[i].id}`)
      if (resOpt) {
        const o = resOpt.product_option || resOpt.prestashop?.product_option
        if (o) opts.push(o)
      }
    }
    attributs.value = opts
  }

  chargementFiche.value = false
}

const fermerFiche = () => {
  produitOuvert.value = null
}

// Extraire les valeurs uniques d'un type d'option (ex: toutes les tailles)
const getValeursOption = (nomOption) => {
  const valeurs = []
  for (let i = 0; i < combinaisons.value.length; i++) {
    const comb = combinaisons.value[i]
    const opts = comb.associations?.product_option_values?.product_option_value
    if (!opts) continue
    const listeOpts = Array.isArray(opts) ? opts : [opts]
    for (let j = 0; j < listeOpts.length; j++) {
      // On vérifie dans nos attributs chargés
      for (let k = 0; k < attributs.value.length; k++) {
        const attr = attributs.value[k]
        const nomAttr = getNomAttr(attr)
        if (nomAttr.toLowerCase().includes(nomOption.toLowerCase())) {
          // Cette combinaison a l'option cherchée
          const valId = listeOpts[j].id
          if (!valeurs.find((v) => v.id === valId)) {
            valeurs.push({ id: valId, label: String(j + 1) })
          }
        }
      }
    }
  }
  return valeurs
}

const getNomAttr = (attr) => {
  if (!attr?.name) return ''
  if (typeof attr.name === 'string') return attr.name
  if (attr.name.language) {
    const l = attr.name.language
    return Array.isArray(l) ? l[0]?.value || l[0]?.['#text'] || '' : l?.value || l?.['#text'] || ''
  }
  return ''
}

// Stock du produit (quantity du produit principal)
// CORRECTION STOCKS : On lit les vraies quantités de la table stock_availables
function getStock(p) {
  if (p == null) return 0;
  
  let totalStock = 0;

  // On parcourt tous les stocks qu'on a téléchargés
  for (let i = 0; i < tousLesStocks.value.length; i++) {
    let s = tousLesStocks.value[i];
    
    // Si l'ID du produit correspond à l'ID du produit dans le stock
    if (String(s.id_product) == String(p.id)) {
      
      // On ajoute la quantité (car un produit peut avoir plusieurs déclinaisons)
      let qte = parseInt(s.quantity);
      if (isNaN(qte) == false) {
        totalStock = totalStock + qte;
      }
      
    }
  }

  return totalStock;
}

const decrementerQuantite = () => {
  if (quantiteChoisie.value > 1) quantiteChoisie.value--
}

const incrementerQuantite = () => {
  if (produitOuvert.value && quantiteChoisie.value < getStock(produitOuvert.value))
    quantiteChoisie.value++
}

// ============================================================
// PANIER
// ============================================================
const ajouterAuPanier = () => {
  const p = produitOuvert.value
  if (!p) return

  const existant = panier.value.find(
    (item) =>
      item.id === p.id &&
      item.taille === tailleChoisie.value &&
      item.couleur === couleurChoisie.value,
  )

  if (existant) {
    existant.quantite += quantiteChoisie.value
  } else {
    panier.value.push({
      id: p.id,
      nom: getNom(p),
      prix: getPrix(p),
      image: getPremierImage(p),
      taille: tailleChoisie.value,
      couleur: couleurChoisie.value,
      quantite: quantiteChoisie.value,
    })
  }

  fermerFiche()
  router.push('/frontoffice/Panier')
}

// ============================================================
// NAVIGATION
// ============================================================
const allerPanier = () => router.push('/frontoffice/Panier')
const allerCommandes = () => router.push('/frontoffice/MesCommandes')
const seDeconnecter = () => {
  session.value = null
  router.push('/frontoffice/Authentification')
}

// Compter articles panier
const nbPanier = computed(() => {
  let n = 0
  for (let i = 0; i < panier.value.length; i++) n += panier.value[i].quantite
  return n
})
</script>

<template>
  <div class="page">
    <!-- ===== HEADER ===== -->
    <header class="header">
      <div class="header-int">
        <div class="header-gauche">
          <span class="logo">🛍️ Ma Boutique</span>
        </div>
        <nav class="header-nav">
          <button class="nav-lien" @click="allerCommandes">Mes commandes</button>
          <span class="nav-sep">|</span>
          <span class="nav-user">
            {{ session?.prenom || 'Invité' }}
          </span>
          <button class="btn-deco" @click="seDeconnecter">Changer</button>
        </nav>
        <button class="btn-panier" @click="allerPanier">
          🛒
          <span v-if="nbPanier > 0" class="badge-panier">{{ nbPanier }}</span>
        </button>
      </div>
    </header>

    <!-- ===== HERO ===== -->
    <div class="hero">
      <h1>Notre Collection</h1>
      <p>Découvrez nos produits sélectionnés pour vous</p>
    </div>

    <!-- ===== BARRE DE RECHERCHE ===== -->
    <div class="barre-recherche">
      <div class="recherche-int">
        <input
          v-model="recherche"
          class="input-recherche"
          placeholder="🔍 Rechercher un produit..."
        />
        <select v-model="categorieChoisie" class="select-cat">
          <option value="">Toutes les catégories</option>
              <option v-for="cat in categories" :key="cat.id" :value="String(cat.id)">
                {{ extraireNomCategorie(cat) || 'Catégorie n°' + cat.id }}
              </option>
        </select>
        <div class="prix-range">
          <input v-model="prixMin" type="number" placeholder="Prix min" class="input-prix" />
          <span>—</span>
          <input v-model="prixMax" type="number" placeholder="Prix max" class="input-prix" />
          <span class="devise">€</span>
        </div>
        <button
          v-if="recherche || categorieChoisie || prixMin || prixMax"
          class="btn-reset"
          @click="reinitialiserFiltres"
        >
          ✕ Effacer
        </button>
      </div>
    </div>

    <!-- ===== CONTENU ===== -->
    <main class="contenu">
      <div v-if="chargement" class="chargement">
        <div class="spinner"></div>
        <p>Chargement des produits...</p>
      </div>

      <p v-else-if="produitsFiltres.length === 0" class="vide">
        Aucun produit ne correspond à vos critères.
      </p>

      <!-- GRILLE PRODUITS -->
      <div v-else class="grille">
        <div v-for="p in produitsFiltres" :key="p.id" class="carte" @click="ouvrirFiche(p)">
          <!-- BADGE HOT/NEW -->
          <div v-if="getBadge(p)" :class="['badge', getBadge(p).classe]">
            {{ getBadge(p).label }}
          </div>

          <!-- IMAGE -->
          <div class="carte-img">
            <img
              :src="getPremierImage(p)"
              :alt="getNom(p)"
              @error="$event.target.style.opacity = '0'"
            />
          </div>

          <!-- INFOS -->
          <div class="carte-corps">
            <p class="carte-categorie">{{ getNomCategorie(p) }}</p>
            <h3 class="carte-nom">{{ getNom(p) }}</h3>
            <div class="carte-prix">
              <span v-if="getPrixReduit(p)" class="prix-barre">{{ getPrix(p).toFixed(2) }} €</span>
              <span class="prix-principal">{{ getPrixReduit(p) || getPrix(p).toFixed(2) }} €</span>
            </div>

            <!-- STOCK -->
            <p :class="['carte-stock', getStock(p) > 0 ? 'stock-dispo' : 'stock-rupture']">
              {{ getStock(p) > 0 ? '● En stock (' + getStock(p) + ')' : '● Rupture de stock' }}
            </p>

            <button class="btn-voir" @click.stop="ouvrirFiche(p)">Voir le produit</button>
          </div>
        </div>
      </div>
    </main>

    <!-- ===== FICHE PRODUIT (MODAL) ===== -->
    <div v-if="produitOuvert" class="overlay" @click.self="fermerFiche">
      <div class="modal">
        <button class="btn-fermer" @click="fermerFiche">✕</button>

        <!-- IMAGE -->
        <div class="modal-img">
          <img
            :src="getPremierImage(produitOuvert)"
            :alt="getNom(produitOuvert)"
            @error="$event.target.style.opacity = '0'"
          />
          <div
            v-if="getBadge(produitOuvert)"
            :class="['badge', getBadge(produitOuvert).classe, 'badge-modal']"
          >
            {{ getBadge(produitOuvert).label }}
          </div>
        </div>

        <!-- INFOS -->
        <div class="modal-corps">
          <p class="modal-categorie">{{ getNomCategorie(produitOuvert) }}</p>
          <h2 class="modal-nom">{{ getNom(produitOuvert) }}</h2>

          <!-- PRIX -->
          <div class="modal-prix-bloc">
            <span v-if="getPrixReduit(produitOuvert)" class="modal-prix-barre"
              >{{ getPrix(produitOuvert).toFixed(2) }} €</span
            >
            <span class="modal-prix"
              >{{ getPrixReduit(produitOuvert) || getPrix(produitOuvert).toFixed(2) }} €</span
            >
            <span v-if="getPrixReduit(produitOuvert)" class="modal-economy">
              Économisez {{ produitOuvert.reduction_percent }}%
            </span>
            <span class="modal-ttc">TTC</span>
          </div>

          <!-- DESCRIPTION -->
          <p class="modal-desc">{{ getDescription(produitOuvert) }}</p>

          <!-- CHARGEMENT DES OPTIONS -->
          <div v-if="chargementFiche" class="options-chargement">⏳ Chargement des options...</div>

          <!-- OPTIONS : si des combinaisons existent -->
          <div v-if="!chargementFiche && combinaisons.length > 0">
            <!-- TAILLE -->
            <div class="option-bloc">
              <label class="option-label"
                >Taille : <strong>{{ tailleChoisie || '—' }}</strong></label
              >
              <div class="option-boutons">
                <button
                  v-for="taille in ['S', 'M', 'L', 'XL']"
                  :key="taille"
                  :class="['btn-option', tailleChoisie === taille ? 'actif' : '']"
                  @click="tailleChoisie = taille"
                >
                  {{ taille }}
                </button>
              </div>
            </div>

            <!-- COULEUR -->
            <div class="option-bloc">
              <label class="option-label"
                >Couleur : <strong>{{ couleurChoisie || '—' }}</strong></label
              >
              <div class="option-boutons">
                <button
                  v-for="coul in ['Blanc', 'Noir', 'Gris', 'Bleu']"
                  :key="coul"
                  :class="['btn-option', couleurChoisie === coul ? 'actif' : '']"
                  @click="couleurChoisie = coul"
                >
                  {{ coul }}
                </button>
              </div>
            </div>
          </div>

          <!-- STOCK -->
          <p
            :class="['modal-stock', getStock(produitOuvert) > 0 ? 'stock-dispo' : 'stock-rupture']"
          >
            {{
              getStock(produitOuvert) > 0
                ? '● En stock — ' + getStock(produitOuvert) + ' disponibles'
                : '● Rupture de stock'
            }}
          </p>

          <!-- QUANTITÉ -->
          <div v-if="getStock(produitOuvert) > 0" class="quantite-bloc">
            <label class="option-label">Quantité</label>
            <div class="quantite-ctrl">
              <button class="btn-qte" @click="decrementerQuantite">−</button>
              <span class="qte-val">{{ quantiteChoisie }}</span>
              <button class="btn-qte" @click="incrementerQuantite">+</button>
            </div>
          </div>

          <!-- AJOUTER AU PANIER -->
          <button
            class="btn-ajouter"
            :disabled="getStock(produitOuvert) <= 0"
            @click="ajouterAuPanier"
          >
            {{ getStock(produitOuvert) > 0 ? '🛒 Ajouter au panier' : 'Rupture de stock' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

/* PAGE */
.page {
  min-height: 100vh;
  background: #f8f6f1;
  font-family: 'Lato', sans-serif;
}

/* HEADER */
.header {
  background: #1a1a2e;
  color: white;
  padding: 0 30px;
  position: sticky;
  top: 0;
  z-index: 50;
}
.header-int {
  max-width: 1300px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  gap: 20px;
}
.logo {
  font-family: 'Playfair Display', serif;
  font-size: 1.3rem;
  color: white;
}
.header-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nav-lien {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.88rem;
  padding: 0;
}
.nav-lien:hover {
  color: #e94560;
}
.nav-sep {
  color: rgba(255, 255, 255, 0.2);
}
.nav-user {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.88rem;
}
.btn-deco {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 10px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.78rem;
}
.btn-deco:hover {
  border-color: #e94560;
  color: #e94560;
}
.btn-panier {
  background: #e94560;
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: 22px;
  cursor: pointer;
  font-size: 1rem;
  position: relative;
}
.badge-panier {
  position: absolute;
  top: -6px;
  right: -6px;
  background: white;
  color: #e94560;
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: 700;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* HERO */
.hero {
  background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%);
  color: white;
  text-align: center;
  padding: 60px 20px 50px;
}
.hero h1 {
  font-family: 'Playfair Display', serif;
  font-size: 3rem;
  margin: 0 0 10px;
}
.hero p {
  color: rgba(255, 255, 255, 0.6);
  font-size: 1.05rem;
  margin: 0;
}

/* BARRE RECHERCHE */
.barre-recherche {
  background: white;
  border-bottom: 1px solid #eee;
  padding: 16px 30px;
  position: sticky;
  top: 64px;
  z-index: 40;
}
.recherche-int {
  max-width: 1300px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.input-recherche {
  flex: 1;
  min-width: 200px;
  padding: 9px 14px;
  border: 1.5px solid #ddd;
  border-radius: 8px;
  font-size: 0.92rem;
}
.input-recherche:focus {
  outline: none;
  border-color: #1a1a2e;
}
.select-cat {
  padding: 9px 12px;
  border: 1.5px solid #ddd;
  border-radius: 8px;
  font-size: 0.88rem;
  cursor: pointer;
}
.prix-range {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input-prix {
  width: 80px;
  padding: 9px 10px;
  border: 1.5px solid #ddd;
  border-radius: 8px;
  font-size: 0.88rem;
}
.devise {
  color: #666;
  font-size: 0.88rem;
}
.btn-reset {
  background: none;
  border: none;
  color: #e94560;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

/* CONTENU */
.contenu {
  max-width: 1300px;
  margin: 0 auto;
  padding: 40px 30px;
}
.chargement {
  text-align: center;
  padding: 80px;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #eee;
  border-top-color: #e94560;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 15px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.vide {
  text-align: center;
  color: #888;
  padding: 60px;
  font-size: 1.1rem;
}

/* GRILLE */
.grille {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 28px;
}

/* CARTE */
.carte {
  background: white;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.carte:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
}

/* BADGE */
.badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  z-index: 2;
}
.badge-hot {
  background: #e94560;
  color: white;
}
.badge-new {
  background: #0f3460;
  color: white;
}
.badge-modal {
  top: 16px;
  left: 16px;
}

/* IMAGE CARTE */
.carte-img {
  height: 200px;
  background: #f0ece4;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.carte-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.carte:hover .carte-img img {
  transform: scale(1.04);
}

/* CORPS CARTE */
.carte-corps {
  padding: 16px;
}
.carte-categorie {
  color: #e94560;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 6px;
}
.carte-nom {
  font-size: 1rem;
  color: #1a1a2e;
  margin: 0 0 10px;
  line-height: 1.35;
  font-weight: 700;
}
.carte-prix {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.prix-barre {
  text-decoration: line-through;
  color: #aaa;
  font-size: 0.88rem;
}
.prix-principal {
  font-size: 1.15rem;
  font-weight: 700;
  color: #1a1a2e;
}
.carte-stock {
  font-size: 0.78rem;
  margin: 0 0 12px;
}
.stock-dispo {
  color: #27ae60;
}
.stock-rupture {
  color: #e94560;
}
.btn-voir {
  background: #1a1a2e;
  color: white;
  border: none;
  padding: 9px 16px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  font-size: 0.88rem;
  transition: background 0.15s;
}
.btn-voir:hover {
  background: #e94560;
}

/* OVERLAY */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

/* MODAL */
.modal {
  background: white;
  border-radius: 20px;
  max-width: 650px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 600px) {
  .modal {
    grid-template-columns: 1fr;
  }
}

.btn-fermer {
  position: absolute;
  top: 14px;
  right: 14px;
  background: white;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.modal-img {
  position: relative;
  background: #f0ece4;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 20px 0 0 20px;
}
.modal-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (max-width: 600px) {
  .modal-img {
    border-radius: 20px 20px 0 0;
    min-height: 220px;
  }
}

.modal-corps {
  padding: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.modal-categorie {
  color: #e94560;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
}
.modal-nom {
  font-family: 'Playfair Display', serif;
  font-size: 1.4rem;
  color: #1a1a2e;
  margin: 0;
  line-height: 1.3;
}
.modal-prix-bloc {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.modal-prix-barre {
  text-decoration: line-through;
  color: #bbb;
  font-size: 0.9rem;
}
.modal-prix {
  font-size: 1.6rem;
  font-weight: 700;
  color: #e94560;
}
.modal-economy {
  background: #e94560;
  color: white;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
}
.modal-ttc {
  color: #aaa;
  font-size: 0.78rem;
}
.modal-desc {
  color: #555;
  font-size: 0.88rem;
  line-height: 1.6;
  margin: 0;
}
.modal-stock {
  font-size: 0.82rem;
  margin: 0;
}

/* OPTIONS */
.options-chargement {
  color: #888;
  font-size: 0.85rem;
}
.option-bloc {
  margin-top: 4px;
}
.option-label {
  font-size: 0.82rem;
  color: #555;
  display: block;
  margin-bottom: 8px;
}
.option-boutons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn-option {
  background: white;
  border: 1.5px solid #ddd;
  color: #1a1a2e;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}
.btn-option:hover {
  border-color: #1a1a2e;
}
.btn-option.actif {
  background: #1a1a2e;
  border-color: #1a1a2e;
  color: white;
}

/* QUANTITÉ */
.quantite-bloc {
  margin-top: 4px;
}
.quantite-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.btn-qte {
  background: #f0f0f0;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 700;
}
.btn-qte:hover {
  background: #e0e0e0;
}
.qte-val {
  font-size: 1rem;
  font-weight: 700;
  min-width: 24px;
  text-align: center;
}

/* AJOUTER AU PANIER */
.btn-ajouter {
  background: #e94560;
  color: white;
  border: none;
  padding: 14px;
  border-radius: 10px;
  cursor: pointer;
  width: 100%;
  font-size: 1rem;
  font-weight: 700;
  margin-top: 8px;
  transition: background 0.15s;
}
.btn-ajouter:hover:not(:disabled) {
  background: #c73652;
}
.btn-ajouter:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
