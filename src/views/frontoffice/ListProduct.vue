<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const session = db.session('utilisateur', null)
const panier = db.live('panier', [])

const chequer = () => {
  router.push('/frontoffice/login')
}

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
      categories.value = liste.filter((c) => Number(c.id) > 2)
    }
  }

  // 3. Récupération des vrais STOCKS
  const resStock = await api.get('stock_availables?display=full')
  if (resStock != null) {
    let rawStock = resStock.stock_availables
    if (rawStock != null) {
      if (Array.isArray(rawStock) == true) {
        tousLesStocks.value = rawStock
      } else {
        tousLesStocks.value = [rawStock]
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
  return extraireNomCategorie(cat)
}

function extraireNomCategorie(cat) {
  if (!cat) return ''
  let n = cat.name
  if (!n) return 'ID: ' + cat.id

  if (typeof n === 'string') return n

  const chercherTexte = (obj) => {
    if (!obj) return null
    return obj.value || obj._ || obj['#text'] || obj.__cdata || null
  }

  if (n.language) {
    const target = Array.isArray(n.language) ? n.language[0] : n.language
    return chercherTexte(target) || 'ID: ' + cat.id
  }

  return chercherTexte(n) || 'ID: ' + cat.id
}

const getImageUrl = (id, idImage) => {
  // PrestaShop : /api/images/products/{id_product}/{id_image}
  return `/api/images/products/${id}/${idImage || 1}?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7`
}

// CORRECTION IMAGES
function getPremierImage(p) {
  let idProduct = p.id
  let idImage = ''

  // 1. On regarde si PrestaShop nous donne directement l'ID de l'image par défaut
  if (p.id_default_image != null && p.id_default_image != '') {
    idImage = p.id_default_image
  }
  // 2. Sinon, on fouille dans la liste des images du produit
  else if (
    p.associations != null &&
    p.associations.images != null &&
    p.associations.images.image != null
  ) {
    let imgs = p.associations.images.image
    if (Array.isArray(imgs) == true) {
      idImage = imgs[0].id
    } else {
      idImage = imgs.id
    }
  }

  // 3. Si on n'a VRAIMENT pas trouvé d'image, on ne fait pas de requête (évite l'erreur 400)
  if (idImage == '') {
    return ''
  }

  // On retourne la bonne URL
  return (
    '/api/images/products/' + idProduct + '/' + idImage + '?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7'
  )
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
  if (p == null) return 0

  let totalStock = 0

  // On parcourt tous les stocks qu'on a téléchargés
  for (let i = 0; i < tousLesStocks.value.length; i++) {
    let s = tousLesStocks.value[i]

    // Si l'ID du produit correspond à l'ID du produit dans le stock
    if (String(s.id_product) == String(p.id)) {
      // On ajoute la quantité (car un produit peut avoir plusieurs déclinaisons)
      let qte = parseInt(s.quantity)
      if (isNaN(qte) == false) {
        totalStock = totalStock + qte
      }
    }
  }

  return totalStock
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
      <a href="#" @click="chequer()">chequer allea</a>

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
            {{ extraireNomCategorie(cat) }}
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

<style scoped src="@/assets/front/ListProduct.css"></style>
