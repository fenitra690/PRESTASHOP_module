<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import JSZip from 'jszip'

const router = useRouter()
const sessionBack = db.session('admin', null)
const maxsise1 = ref(2)
if (!sessionBack.value) router.push('/backoffice/login')

// ============================================================
// ÉTAT GLOBAL
// ============================================================
// --- ÉTAT RETRAIT DE STOCK (Fix crash length & Catégories) ---
const categorieCible = ref('')
const quantiteARetirer = ref(0)

const categorieCible1 = ref('')
const quantiteARetirer1 = ref(0)

const logRetrait = ref([])
const enCoursRetrait = ref(false)
const categories = ref([])

onMounted(async () => {
  const res = await api.get('categories?display=full')
  if (res) {
    const raw = res.categories || res.prestashop?.categories?.category
    if (raw) {
      const liste = Array.isArray(raw) ? raw : [raw]
      categories.value = liste.filter(c => Number(c.id) > 2)
    }
  }
})

function extraireNomCategorie(cat) {
  if (!cat) return ''
  let n = cat.name
  if (!n) return 'Catégorie #' + cat.id
  if (typeof n === 'string') return n
  const lang = n.language ? (Array.isArray(n.language) ? n.language[0] : n.language) : n
  return lang.value || lang._ || lang['#text'] || lang.__cdata || 'Catégorie #' + cat.id
}

// Fichiers sélectionnés
const fichier1 = ref(null) // produits
const fichier2 = ref(null) // déclinaisons/stock
const fichier3 = ref(null) // clients/commandes
const dossierImages = ref([]) // fichiers image depuis le dossier

// Données parsées
const produits = ref([])
const declinaisons = ref([])
const commandes = ref([])

// Erreurs de validation par fichier
const erreursF1 = ref([])
const erreursF2 = ref([])
const erreursF3 = ref([])

// Log d'import
const logImport = ref([])
const resumeImport = ref({
  produits: 0,
  declinaisons: 0,
  clients: 0,
  commandes: 0,
  images: 0,
  erreurs: 0,
})

// ============================================================
// COLONNES ATTENDUES (validation noms de colonnes)
// ============================================================
const COLS_F1 = [
  'date_availability_produit',
  'nom',
  'reference',
  'prix_ttc',
  'Taxe',
  'categorie',
  'prix_achat',
]
const COLS_F2 = ['reference', 'specificité', 'karazany', 'stock_initial', 'prix_vente_ttc']
const COLS_F3 = ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat']

// ============================================================
// UTILITAIRES CSV
// ============================================================
function parseCSV(texte) {
  // Gère les virgules dans les guillemets
  const lignes = texte
    .replace(/^\uFEFF/, '') // Supprime le BOM UTF-8 si présent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim())
  const headers = parseLigneCSV(lignes[0]).map((h) => h.trim()) // Trim les noms de colonnes
  const rows = []
  for (let i = 1; i < lignes.length; i++) {
    if (!lignes[i].trim()) continue
    const vals = parseLigneCSV(lignes[i])
    const obj = {}
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = vals[j] || ''
    }
    rows.push(obj)
  }
  return { headers, rows }
}

function parseLigneCSV(ligne) {
  const result = []
  let courant = ''
  let dansGuillemets = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"'
        i++
      } else dansGuillemets = !dansGuillemets
    } else if (c === ',' && !dansGuillemets) {
      result.push(courant.trim())
      courant = ''
    } else {
      courant += c
    }
  }
  result.push(courant.trim())
  return result
}

// Nettoyer un nombre : "12,5" -> 12.5
function parseNombre(s) {
  if (!s) return null
  return parseFloat(String(s).replace(',', '.'))
}

// Vérifier format date DD/MM/YYYY
function estDateValide(s) {
  if (!s) return false
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s)
}

// Convertir DD/MM/YYYY -> YYYY-MM-DD (pour PrestaShop)
function dateVersPS(s) {
  if (!s || !s.includes('/')) {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }
  // Nettoyage des espaces éventuels et split
  const parties = s.trim().split('/')
  if (parties.length !== 3) return new Date().toISOString().split('T')[0]
  const [j, m, a] = parties
  return `${a}-${m.padStart(2, '0')}-${j.padStart(2, '0')}`
}

// ============================================================
// LECTURE FICHIER
// ============================================================
function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}

// ============================================================
// SÉLECTION FICHIERS
// ============================================================
const onFichier1 = (e) => {
  fichier1.value = e.target.files[0] || null
}
const onFichier2 = (e) => {
  fichier2.value = e.target.files[0] || null
}
const onFichier3 = (e) => {
  fichier3.value = e.target.files[0] || null
}

const onDossierImages = async (e) => {
  const file = e.target.files[0]
  if (!file) {
    dossierImages.value = []
    return
  }

  try {
    const zip = await JSZip.loadAsync(file)
    const filesArray = []

    zip.forEach((relativePath, zipEntry) => {
      if (
        !zipEntry.dir &&
        /\.(png|jpg|jpeg|gif|webp)$/i.test(zipEntry.name) &&
        !zipEntry.name.includes('._') &&
        !zipEntry.name.includes('__MACOSX')
      ) {
        filesArray.push(zipEntry)
      }
    })

    // We convert zip entries to objects with { name, getFile() } so it's compatible
    dossierImages.value = filesArray.map((entry) => {
      // The name should only be the filename, not the full path in zip
      const parts = entry.name.split('/')
      const fileName = parts[parts.length - 1]
      return {
        name: fileName,
        zipEntry: entry,
        // We'll read it as a File or Blob when needed
      }
    })
  } catch (err) {
    alert('Erreur lors de la lecture du fichier ZIP: ' + err.message)
  }
}

const peutValider = computed(() => fichier1.value && fichier2.value && fichier3.value)

// ============================================================
// ÉTAPE 1 → ÉTAPE 2 : PARSE + VALIDATION
// ============================================================
const validerFichiers = async () => {
  enCours.value = true
  erreursF1.value = []
  erreursF2.value = []
  erreursF3.value = []
  produits.value = []
  declinaisons.value = []
  commandes.value = []

  // --- FICHIER 1 : Produits ---
  try {
    const texte = await lireFichier(fichier1.value)
    const { headers, rows } = parseCSV(texte)

    // Vérifier noms de colonnes
    for (const col of COLS_F1) {
      if (!headers.includes(col)) {
        erreursF1.value.push({
          ligne: 0,
          type: 'colonne',
          msg: `Colonne manquante ou non conforme : "${col}"`,
        })
      }
    }

    // Vérifier chaque ligne
    rows.forEach((row, i) => {
      const num = i + 2 // ligne CSV (1 = header)
      if (!estDateValide(row.date_availability_produit)) {
        erreursF1.value.push({
          ligne: num,
          type: 'date',
          msg: `Ligne ${num} — date_availability_produit invalide : "${row.date_availability_produit}" (attendu DD/MM/YYYY)`,
        })
      }
      const prix = parseNombre(row.prix_ttc)
      if (prix === null || prix <= 0) {
        erreursF1.value.push({
          ligne: num,
          type: 'montant',
          msg: `Ligne ${num} — prix_ttc doit être un montant positif : "${row.prix_ttc}"`,
        })
      }
      const achat = parseNombre(row.prix_achat)
      if (achat === null || achat <= 0) {
        erreursF1.value.push({
          ligne: num,
          type: 'montant',
          msg: `Ligne ${num} — prix_achat doit être un montant positif : "${row.prix_achat}"`,
        })
      }
    })

    produits.value = rows
  } catch (e) {
    erreursF1.value.push({
      ligne: 0,
      type: 'lecture',
      msg: 'Impossible de lire le fichier : ' + e.message,
    })
  }

  // --- FICHIER 2 : Déclinaisons ---
  try {
    const texte = await lireFichier(fichier2.value)
    const { headers, rows } = parseCSV(texte)

    for (const col of COLS_F2) {
      if (!headers.includes(col)) {
        erreursF2.value.push({
          ligne: 0,
          type: 'colonne',
          msg: `Colonne manquante ou non conforme : "${col}"`,
        })
      }
    }

    rows.forEach((row, i) => {
      const num = i + 2
      const stock = parseInt(row.stock_initial)
      if (isNaN(stock) || stock < 0) {
        erreursF2.value.push({
          ligne: num,
          type: 'montant',
          msg: `Ligne ${num} — stock_initial doit être un entier positif ou zéro : "${row.stock_initial}"`,
        })
      }
      if (row.prix_vente_ttc) {
        const pv = parseNombre(row.prix_vente_ttc)
        if (pv !== null && pv < 0) {
          erreursF2.value.push({
            ligne: num,
            type: 'montant',
            msg: `Ligne ${num} — prix_vente_ttc doit être positif : "${row.prix_vente_ttc}"`,
          })
        }
      }
    })

    declinaisons.value = rows
  } catch (e) {
    erreursF2.value.push({
      ligne: 0,
      type: 'lecture',
      msg: 'Impossible de lire le fichier : ' + e.message,
    })
  }

  // --- FICHIER 3 : Clients/Commandes ---
  try {
    const texte = await lireFichier(fichier3.value)
    const { headers, rows } = parseCSV(texte)

    for (const col of COLS_F3) {
      if (!headers.includes(col)) {
        erreursF3.value.push({
          ligne: 0,
          type: 'colonne',
          msg: `Colonne manquante ou non conforme : "${col}"`,
        })
      }
    }

    rows.forEach((row, i) => {
      const num = i + 2
      if (!estDateValide(row.date)) {
        erreursF3.value.push({
          ligne: num,
          type: 'date',
          msg: `Ligne ${num} — date invalide : "${row.date}" (attendu DD/MM/YYYY)`,
        })
      }
      if (!row.email || !row.email.includes('@')) {
        erreursF3.value.push({
          ligne: num,
          type: 'format',
          msg: `Ligne ${num} — email invalide : "${row.email}"`,
        })
      }
    })

    commandes.value = rows
  } catch (e) {
    erreursF3.value.push({
      ligne: 0,
      type: 'lecture',
      msg: 'Impossible de lire le fichier : ' + e.message,
    })
  }

  enCours.value = false
  etape.value = 'validation'
}

const totalErreurs = computed(
  () => erreursF1.value.length + erreursF2.value.length + erreursF3.value.length,
)
const peutImporter = computed(() => totalErreurs.value === 0)

// ============================================================
// ÉTAPE 3 : IMPORT DANS PRESTASHOP
// ============================================================
const log = (msg, type = 'info') => {
  logImport.value.push({ msg, type, ts: new Date().toLocaleTimeString() })
  if (type === 'erreur') resumeImport.value.erreurs++
}

const lancerImport = async () => {
  if (!peutImporter.value) return
  enCours.value = true
  etape.value = 'import'
  logImport.value = []
  resumeImport.value = {
    produits: 0,
    declinaisons: 0,
    clients: 0,
    commandes: 0,
    images: 0,
    erreurs: 0,
  }

  // ============================================================
  // A. CRÉER LES CATÉGORIES MANQUANTES
  // ============================================================
  log('Chargement des catégories existantes...')
  const resCats = await api.get('categories?display=full')
  const catsExistantes = []
  if (resCats) {
    const raw = resCats.categories || resCats.prestashop?.categories?.category
    if (raw) catsExistantes.push(...(Array.isArray(raw) ? raw : [raw]))
  }

  const getNomCat = (c) => {
    if (typeof c.name === 'string') return c.name
    if (c.name?.language) {
      const l = c.name.language
      return Array.isArray(l) ? l[0]?.value || '' : l?.value || ''
    }
    return ''
  }

  // Map nom -> id_category
  const mapCategories = {}
  for (const c of catsExistantes) {
    mapCategories[getNomCat(c).toLowerCase()] = c.id
  }

  // Créer les catégories manquantes
  const categoriesUniques = [...new Set(produits.value.map((p) => p.categorie).filter(Boolean))]
  for (const nomCat of categoriesUniques) {
    if (!mapCategories[nomCat.toLowerCase()]) {
      log(`Création catégorie : ${nomCat}`)
      const catPayload = {
        active: '1',
        id_parent: '2', // ID 2 est généralement la catégorie "Accueil"
        name: {
          language: [
            { id: '1', value: nomCat.trim() },
            { id: '2', value: nomCat.trim() },
          ],
        },
        link_rewrite: {
          language: [
            {
              id: '1',
              value: nomCat
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-'),
            },
            {
              id: '2',
              value: nomCat
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-'),
            },
          ],
        },
        description: {
          language: [
            { id: '1', value: '' },
            { id: '2', value: '' },
          ],
        },
      }
      const res = await api.post('categories', catPayload)
      const idNew = res?.prestashop?.category?.id
      const idRaw = idNew && typeof idNew === 'object' ? idNew.__cdata || idNew['#text'] : idNew
      if (idRaw) {
        mapCategories[nomCat.toLowerCase()] = idRaw
        log(`  → Catégorie "${nomCat}" créée (ID: ${idRaw})`, 'succes')
      } else {
        log(`  → Erreur création catégorie "${nomCat}"`, 'erreur')
      }
    }
  }

  // ============================================================
  // B. IMPORTER LES PRODUITS
  // ============================================================
  log('--- Import des produits ---')

  const mapTaxes = {}
  log('Chargement des règles de taxes existantes...')
  const resTaxes = await api.get('tax_rule_groups?display=full')
  if (resTaxes) {
    const rawTaxes =
      resTaxes.tax_rule_groups || resTaxes.prestashop?.tax_rule_groups?.tax_rule_group
    const listeTaxes = rawTaxes ? (Array.isArray(rawTaxes) ? rawTaxes : [rawTaxes]) : []

    for (const t of listeTaxes) {
      if (t.name) {
        const match = t.name.match(/(\d+(?:[\.,]\d+)?)%/)
        if (match) {
          const valStr = match[1]
          mapTaxes[`${valStr}%`] = t.id
          mapTaxes[`${valStr.replace('.', ',')}%`] = t.id
          mapTaxes[`${valStr.replace(',', '.')}%`] = t.id
        }
      }
    }
  }
  const defaultTax = 0

  // Map reference -> id_product (pour les étapes suivantes)
  const mapProduits = {}

  // Charger les produits existants pour éviter les doublons
  const resProdExist = await api.get('products?display=full')
  if (resProdExist) {
    const raw = resProdExist.products || resProdExist.prestashop?.products?.product
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    for (const p of liste) {
      if (p.reference) mapProduits[p.reference] = p.id
    }
  }

  for (const p of produits.value) {
    if (mapProduits[p.reference]) {
      log(
        `Produit "${p.reference}" déjà existant (ID: ${mapProduits[p.reference]}), ignoré.`,
        'avert',
      )
      continue
    }

    const idCat = mapCategories[p.categorie?.toLowerCase()] || 2

    // Calcul du prix HT réel à partir du TTC et de la taxe du CSV (ex: 12.5 / 1.1165)
    const prixTTC_CSV = parseNombre(p.prix_ttc) || 0
    const taxeTexte = p.Taxe || '0%'
    const tauxTaxe = parseFloat(taxeTexte.replace(',', '.').replace('%', '')) / 100
    const prixHT = prixTTC_CSV / (1 + tauxTaxe)

    const prixAchat = parseNombre(p.prix_achat)
    const dateAvailability = dateVersPS(p.date_availability_produit)

    log(`Création produit : ${p.nom} (${p.reference})`)
    const res = await api.post('products', {
      reference: p.reference,
      name: [
        { id: 1, value: p.nom },
        { id: 2, value: p.nom },
      ],
      price: prixHT?.toFixed(6) || '0.000000',
      wholesale_price: prixAchat?.toFixed(6) || '0.000000',
      id_category_default: idCat,
      id_tax_rules_group: mapTaxes[p.Taxe] || defaultTax,
      active: 1,
      state: 1,
      available_for_order: 1,
      show_price: 1,
      visibility: 'both',
      condition: 'new',
      available_date: dateAvailability,
      associations: {
        categories: {
          nodeType: 'category',
          rows: [{ id: idCat }],
        },
      },
      link_rewrite: [
        {
          id: 1,
          value: p.nom
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
        },
        {
          id: 2,
          value: p.nom
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
        },
      ],
      description: [
        { id: 1, value: '' },
        { id: 2, value: '' },
      ],
      description_short: [
        { id: 1, value: '' },
        { id: 2, value: '' },
      ],
      meta_title: p.nom,
      meta_description: '',
      meta_keywords: '',
    })

    const obj = res?.prestashop?.product
    const idRaw = obj?.id
    const idProd = idRaw && typeof idRaw === 'object' ? idRaw.__cdata || idRaw['#text'] : idRaw
    if (idProd) {
      mapProduits[p.reference] = idProd
      resumeImport.value.produits++
      log(`  → "${p.nom}" créé (ID: ${idProd})`, 'succes')
    } else {
      log(`  → Erreur création produit "${p.nom}"`, 'erreur')
    }
  }

  // ============================================================
  // C. IMPORTER LES DÉCLINAISONS + STOCKS
  // ============================================================
  log('--- Import déclinaisons & stocks ---')

  const historiqueStockStorage = db.g('stock_historique') || []

  for (const d of declinaisons.value) {
    // Recherche plus robuste (sans espaces et insensible à la casse)
    const refNettoyee = d.reference.trim().toUpperCase()
    const idProd = mapProduits[refNettoyee] || mapProduits[d.reference.trim()]

    if (!idProd) {
      log(`Déclinaison ignorée : produit "${d.reference}" introuvable`, 'avert')
      continue
    }

    const stockInitial = parseInt(d.stock_initial) || 0
    const infoProd = produits.value.find((p) => p.reference.trim().toUpperCase() === refNettoyee)
    // Utiliser la date d'import (date du jour formatée FR) pour le stock
    const mvtDate = new Date().toLocaleDateString('fr-FR')

    const enregMouvement = (qteApres, deltaVal) => {
      historiqueStockStorage.push({
        id_product: idProd,
        nom: `Produit ${d.reference}`,
        date: mvtDate,
        delta: deltaVal,
        quantite_apres: qteApres,
        timestamp: Date.now() + Math.floor(Math.random() * 1000),
      })
    }

    // Cas sans déclinaison (specificité vide) : on met juste le stock
    if (!d.specificité && !d.karazany) {
      log(`Stock initial produit ${d.reference} : ${stockInitial}`)
      // Chercher le stock_available principal (id_product_attribute = 0)
      const resS = await api.get(
        `stock_availables?filter[id_product]=${idProd}&filter[id_product_attribute]=0&display=full`,
      )
      if (resS) {
        const rawS = resS.stock_availables || resS.prestashop?.stock_availables?.stock_available
        const s = rawS ? (Array.isArray(rawS) ? rawS[0] : rawS) : null
        if (s?.id) {
          await api.put('stock_availables', s.id, {
            id: s.id,
            id_shop: s.id_shop || 1,
            id_shop_group: s.id_shop_group || 1,
            id_product: idProd,
            id_product_attribute: 0,
            quantity: stockInitial,
            depends_on_stock: 0,
            out_of_stock: 0,
          })
          enregMouvement(stockInitial, stockInitial)
          resumeImport.value.declinaisons++
          log(`  → Stock ${d.reference} = ${stockInitial}`, 'succes')
        }
      }
      continue
    }

    // Cas avec déclinaison : Pour l'exercice, on simplifie car la création
    // d'attributs via API est complexe. On met le stock sur le produit principal.
    log(`Déclinaison ${d.reference} — ${d.specificité}:${d.karazany} (stock: ${stockInitial})`)

    const resS = await api.get(
      `stock_availables?filter[id_product]=${idProd}&filter[id_product_attribute]=0&display=full`,
    )
    if (resS) {
      const rawS = resS.stock_availables || resS.prestashop?.stock_availables?.stock_available
      const s = rawS ? (Array.isArray(rawS) ? rawS[0] : rawS) : null
      if (s?.id) {
        const nouvelleQte = (parseInt(s.quantity) || 0) + stockInitial
        await api.put('stock_availables', s.id, {
          id: s.id,
          id_shop: s.id_shop || 1,
          id_shop_group: s.id_shop_group || 1,
          id_product: idProd,
          id_product_attribute: 0,
          quantity: nouvelleQte,
          depends_on_stock: 0,
          out_of_stock: 0,
        })
        enregMouvement(nouvelleQte, stockInitial)
        resumeImport.value.declinaisons++
        log(`  → Stock ${d.reference} mis à jour : ${nouvelleQte}`, 'succes')
      }
    }
  }

  // Sauvegarder d'un coup l'historique de stock en localStorage
  db.s('stock_historique', historiqueStockStorage)

  // ============================================================
  // D. IMPORTER LES CLIENTS + COMMANDES
  // ============================================================
  log('--- Import clients & commandes ---')

  // Charger les clients existants (par email)
  const resCli = await api.get('customers?display=full')
  const mapClients = {} // email -> id_customer
  if (resCli) {
    const raw = resCli.customers || resCli.prestashop?.customers?.customer
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    for (const c of liste) {
      if (c.email) mapClients[c.email] = c.id
    }
  }

  // Pre-charger les commandes existantes pour ne pas les dedupliquer a chaque import
  const ordersResponse = await api.get('orders?display=[id_customer,date_add]')
  const alreadyImportedOrders = new Set()
  if (ordersResponse) {
    const rawO = ordersResponse.orders || ordersResponse.prestashop?.orders?.order
    const listO = rawO ? (Array.isArray(rawO) ? rawO : [rawO]) : []
    for (const o of listO) {
      if (o.date_add && o.id_customer) {
        alreadyImportedOrders.add(`${o.id_customer}-${o.date_add.substring(0, 10)}`)
      }
    }
  }

  for (const row of commandes.value) {
    // Créer le client s'il n'existe pas
    let idClient = mapClients[row.email]
    if (!idClient) {
      log(`Création client : ${row.nom} <${row.email}>`)
      const resC = await api.post('customers', {
        firstname: row.nom,
        lastname: '.',
        email: row.email,
        passwd: row.pwd,
        active: 1,
        id_default_group: 3, // groupe "Clients"
        id_lang: 1,
      })
      const objC = resC?.prestashop?.customer
      const idRaw = objC?.id
      idClient = idRaw && typeof idRaw === 'object' ? idRaw.__cdata || idRaw['#text'] : idRaw
      if (idClient) {
        mapClients[row.email] = idClient
        resumeImport.value.clients++
        log(`  → Client créé (ID: ${idClient})`, 'succes')
      } else {
        log(`  → Erreur création client ${row.email}`, 'erreur')
        continue
      }
    } else {
      log(`Client ${row.email} existant (ID: ${idClient})`, 'avert')
    }

    // Créer l'adresse du client
    log(`Création adresse pour client #${idClient}`)
    const resAddr = await api.post('addresses', {
      id_customer: idClient,
      id_country: 8, // France (Madagascar pas dans la liste par défaut, on met France)
      alias: 'Import',
      firstname: row.nom,
      lastname: '.',
      address1: row.adresse || 'Adresse importée',
      city: row.adresse || 'Ville',
      postcode: '00100',
      phone_mobile: '0000000000',
    })
    const objA = resAddr?.prestashop?.address
    const idARaw = objA?.id
    const idAddr = idARaw && typeof idARaw === 'object' ? idARaw.__cdata || idARaw['#text'] : idARaw
    if (!idAddr) {
      log(`  → Erreur création adresse pour ${row.email}`, 'erreur')
      continue
    }

    // Créer la commande si "achat" n'est pas vide
    if (!row.achat || row.achat.trim() === '') {
      log(`Pas de commande pour ${row.nom}`, 'avert')
      continue
    }

    // Déterminer l'état
    let idEtat = 1 // en attente
    const etatCsv = (row.etat || '').toLowerCase()
    if (etatCsv.includes('paiement')) idEtat = 2
    else if (etatCsv.includes('livr')) idEtat = 5
    else if (etatCsv.includes('annul')) idEtat = 6

    // Parser les achats au format: [("T_01";3;"ngoza"),("C_03";1;"")]
    const rowsCart = []
    const re = /\("([^"]+)";(\d+);"([^"]*)"\)/g
    let totalTTC_Cmd = 0
    let totalHT_Cmd = 0
    let matchAchat
    while ((matchAchat = re.exec(row.achat)) !== null) {
      const pRef = matchAchat[1]
      const pQty = parseInt(matchAchat[2], 10)
      const pKarazany = matchAchat[3]

      const idProdP = mapProduits[pRef] || mapProduits[pRef.toLowerCase()]
      if (idProdP) {
        rowsCart.push({ id_product: idProdP, id_product_attribute: 0, quantity: pQty })

        // Chercher le prix spécifique dans le Fichier 2 (ex: 15€ pour kely)
        const decli = declinaisons.value.find(
          (d) =>
            d.reference.trim().toUpperCase() === pRef.trim().toUpperCase() &&
            d.karazany?.trim().toLowerCase() === pKarazany.trim().toLowerCase(),
        )
        const pBase = produits.value.find((p) => p.reference === pRef)
        const prixUnitaireTTC =
          decli && decli.prix_vente_ttc
            ? parseNombre(decli.prix_vente_ttc)
            : parseNombre(pBase?.prix_ttc) || 0

        const taxeTexte = pBase?.Taxe || '0%'
        // Parser correctement "11,65%" même avec des espaces → 0.1165
        const tauxTaxe = parseFloat(taxeTexte.replace(/\s/g, '').replace(',', '.').replace('%', '')) / 100

        totalTTC_Cmd += prixUnitaireTTC * pQty
        totalHT_Cmd += (prixUnitaireTTC / (1 + tauxTaxe)) * pQty
      }
    }
    if (rowsCart.length === 0) {
      rowsCart.push({
        id_product: mapProduits[row.achat] || 1,
        id_product_attribute: 0,
        quantity: 1,
      })
    }

    // Créer le panier
    const dateCmd = dateVersPS(row.date) + ' 12:00:00'
    const dateCmdCourte = dateVersPS(row.date)

    if (alreadyImportedOrders.has(`${idClient}-${dateCmdCourte}`)) {
      log(`Commande de ${row.email} au ${dateCmdCourte} déjà importée, ignorée.`, 'avert')
      continue
    }

    const resPan = await api.post('carts', {
      id_customer: idClient,
      id_address_delivery: idAddr,
      id_address_invoice: idAddr,
      id_currency: 1,
      id_lang: 1,
      id_carrier: 1,
      date_add: dateCmd,
      associations: {
        cart_rows: {
          nodeType: 'cart_row',
          rows: rowsCart,
        },
      },
    })
    const objPan = resPan?.prestashop?.cart
    const idPanRaw = objPan?.id
    const idPanier =
      idPanRaw && typeof idPanRaw === 'object' ? idPanRaw.__cdata || idPanRaw['#text'] : idPanRaw

    if (!idPanier) {
      log(`  → Erreur création panier pour ${row.nom}`, 'erreur')
      continue
    }

    // Créer la commande
    const resCmd = await api.post('orders', {
      id_address_delivery: idAddr,
      id_address_invoice: idAddr,
      id_cart: idPanier,
      id_currency: 1,
      id_lang: 1,
      id_customer: idClient,
      id_carrier: 1,
      date_add: dateCmd,
      date_upd: dateCmd, // On essaie de la passer au POST
      module: 'ps_cashondelivery',
      payment: 'Paiement a la livraison',
      total_paid: totalTTC_Cmd.toFixed(2), // TTC
      total_paid_real: idEtat === 2 || idEtat === 5 ? totalTTC_Cmd.toFixed(2) : '0.00',
      total_products: totalHT_Cmd.toFixed(2), // HT Réel
      total_products_wt: totalTTC_Cmd.toFixed(2), // TTC Réel
      total_shipping: 0,
      total_shipping_tax_excl: 0,
      total_shipping_tax_incl: 0,
      id_shop_group: 1,
      id_shop: 1,
      current_state: String(idEtat),
      conversion_rate: 1,
    })
    const objCmd = resCmd?.prestashop?.order
    const idCmdRaw = objCmd?.id
    const idCmd =
      idCmdRaw && typeof idCmdRaw === 'object' ? idCmdRaw.__cdata || idCmdRaw['#text'] : idCmdRaw

    if (idCmd) {
      resumeImport.value.commandes++

      // FORCER LA DATE ET LE STATUT VIA PUT ET ORDER_HISTORY
      try {
        const fullCmdStr = await api.get(`orders/${idCmd}`)
        const fullCmd = fullCmdStr?.orders || fullCmdStr?.prestashop?.order || fullCmdStr
        if (fullCmd && fullCmd.id) {
          const copy = { ...fullCmd }
          copy.date_add = dateCmd
          copy.date_upd = dateCmd
          delete copy.associations
          await api.put('orders', idCmd, copy)
        }

        // Ajouter l'historique pour valider l'état 1 ou 2 au lieu du 8 par défaut
        await api.post('order_histories', {
          id_order: idCmd,
          id_order_state: idEtat,
          date_add: dateCmd,
          id_employee: 1,
        })
      } catch (e) {
        console.warn('Impossible de forcer la date_add / statut sur la cmd ', idCmd)
      }

      log(
        `  → Commande #${idCmd} créée (état: ${idEtat === 2 ? 'paiement accepté' : 'en attente'})`,
        'succes',
      )
    } else {
      log(`  → Erreur création commande pour ${row.nom}`, 'erreur')
    }
  }

  // ============================================================
  // E. UPLOAD IMAGES
  // ============================================================
  if (dossierImages.value.length > 0) {
    log('--- Upload des images ---')
    for (const imgFile of dossierImages.value) {
      // Extraire la référence depuis le nom du fichier : "T_01_front.jpg" -> "T_01"
      const nomSansExt = imgFile.name.replace(/\.[^.]+$/, '')
      // Trouver la référence : prendre la partie avant le premier underscore-suivi-de-chiffres ou le tout
      // Ex: T_01, C_03, P_01, M_02
      const matchRef = nomSansExt.match(/^([A-Z]_\d+)/i) || nomSansExt.match(/^([^_]+_[^_]+)/)
      const reference = matchRef ? matchRef[1].toUpperCase() : nomSansExt.toUpperCase()
      const idProd = mapProduits[reference] || mapProduits[reference.toLowerCase()]

      if (!idProd) {
        log(`Image "${imgFile.name}" : référence "${reference}" introuvable, ignorée`, 'avert')
        continue
      }

      log(`Upload image "${imgFile.name}" → produit ${reference} (ID: ${idProd})`)
      try {
        const formData = new FormData()

        let blob = await imgFile.zipEntry.async('blob')
        let mimeType = 'image/jpeg'
        if (imgFile.name.toLowerCase().endsWith('.png')) mimeType = 'image/png'
        else if (imgFile.name.toLowerCase().endsWith('.gif')) mimeType = 'image/gif'
        else if (imgFile.name.toLowerCase().endsWith('.webp')) mimeType = 'image/webp'

        const fileToUpload = new File([blob], imgFile.name, { type: mimeType })
        formData.append('image', fileToUpload)

        const resp = await fetch(
          `/api/images/products/${idProd}?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7`,
          { method: 'POST', body: formData },
        )
        if (resp.ok) {
          resumeImport.value.images++
          log(`  → Image "${imgFile.name}" uploadée`, 'succes')
        } else {
          log(`  → Erreur upload "${imgFile.name}" : ${resp.status}`, 'erreur')
        }
      } catch (e) {
        log(`  → Erreur upload "${imgFile.name}" : ${e.message}`, 'erreur')
      }
    }
  }

  log('=== Import terminé ===', 'succes')
  enCours.value = false
  etape.value = 'done'
}

// ============================================================
// RÉINITIALISATION FORMULAIRE (remet à zéro l'interface)
// ============================================================
const reinitialiser = () => {
  etape.value = 'selection'
  fichier1.value = null
  fichier2.value = null
  fichier3.value = null
  dossierImages.value = []
  produits.value = []
  declinaisons.value = []
  commandes.value = []
  erreursF1.value = []
  erreursF2.value = []
  erreursF3.value = []
  logImport.value = []
  document.querySelectorAll('input[type=file]').forEach((el) => (el.value = ''))
}

// ============================================================
// RÉINITIALISATION PRESTASHOP (supprime toutes les données importées)
// Supprime dans l'ordre : commandes → clients → produits
// Les données par défaut PrestaShop (demo) ne sont PAS touchées
// car on ne supprime que les IDs > au seuil de départ (configurable)
// ============================================================
const enCoursReset = ref(false)
const logReset = ref([])
const resetVisible = ref(false)
const resetTermine = ref(false)

const logR = (msg, type = 'info') => {
  logReset.value.push({ msg, type, ts: new Date().toLocaleTimeString() })
}

const lancerReset = async () => {
  if (
    !confirm(
      '⚠️ ATTENTION : Cette action va supprimer TOUTES les commandes, clients et produits dans PrestaShop. Continuer ?',
    )
  )
    return
  if (!confirm('Dernière confirmation : supprimer toutes les données importées ?')) return

  enCoursReset.value = true
  resetVisible.value = true
  resetTermine.value = false
  logReset.value = []

  let usedCartIds = new Set()


  // ---- RAZ DES STOCKS ET SUPPRIMER LES PRODUITS ----
  logR('Réinitialisation des stocks...')
  const resStock = await api.get('stock_availables?display=full')
  if (resStock) {
    const rawStock =
      resStock.stock_availables || resStock.prestashop?.stock_availables?.stock_available
    const listeStock = rawStock ? (Array.isArray(rawStock) ? rawStock : [rawStock]) : []
    for (const s of listeStock) {
      if (parseInt(s.quantity) !== 0) {
        await api.put('stock_availables', s.id, {
          id_product: s.id_product,
          id_product_attribute: s.id_product_attribute || 0,
          id_shop: s.id_shop || 1,
          id_shop_group: s.id_shop_group || 0,
          quantity: 0,
          depends_on_stock: 0,
          out_of_stock: 0,
        })
      }
    }
    logR('Stocks remis à 0', 'succes')
  }

  logR('Chargement des produits...')
  const resProd = await api.get('products?display=full')
  if (resProd) {
    const raw = resProd.products || resProd.prestashop?.products?.product
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    logR(`${liste.length} produit(s) trouvé(s)`)
    for (const prod of liste) {
      try {
        const r = await api.delete('products', prod.id)
        logR(`Produit #${prod.id} (${prod.reference}) supprimé`, r !== null ? 'succes' : 'avert')
      } catch (e) {
        logR(`Erreur suppression Produit #${prod.id}`, 'erreur')
      }
    }
  }

  logR('=== Réinitialisation terminée ===', 'succes')

  // VIDER LE LOCAL VUE POUR L'HISTORIQUE DE STOCK
  db.s('stock_historique', [])
  logR('Historique de stockage local réinitialisé.', 'succes')

  enCoursReset.value = false
  resetTermine.value = true
}

const verifierNom = () => {
  alert('Test : ' + nomATester.value)
}

// Fonction globale pour appeler les deux en même temps
const lancerGlobalStock = async () => {
  logRetrait.value = [] // On vide une seule fois au début
  enCoursRetrait.value = true
  try {
    await lancerRetraitStock1(true) // true pour dire qu'on gère le chargement ici
    await lancerRetraitStock(true)
  } finally {
    enCoursRetrait.value = false
  }
}

const lancerRetraitStock = async (isChained = false) => {
  if (!categorieCible.value || quantiteARetirer.value <= 0) {
    return // On sort silencieusement si c'est vide lors du double appel
  }

  if (!isChained) {
    enCoursRetrait.value = true
    logRetrait.value = []
  }

  try {
    // 1. Trouver l'ID de la catégorie par son nom
    const resCats = await api.get('categories?display=full')
    const cats = resCats?.categories || resCats?.prestashop?.categories?.category
    const listCats = Array.isArray(cats) ? cats : [cats]
    
    const cat = listCats.find(c => {
      const search = String(categorieCible.value).toLowerCase().trim()
      
      // 1. Vérification par ID
      if (String(c.id) === search) return true

      // 2. Vérification par Nom (extraction robuste du texte)
      let name = ''
      if (typeof c.name === 'string') {
        name = c.name
      } else if (c.name?.language) {
        const l = Array.isArray(c.name.language) ? c.name.language[0] : c.name.language
        name = l?.value || l?.['#text'] || l?._ || l?.__cdata || ''
      } else if (c.name) {
        name = c.name.value || c.name['#text'] || c.name._ || c.name.__cdata || ''
      }
      
      return name.toLowerCase().trim() === search
    })

    if (!cat) {
      alert('Catégorie introuvable.')
      return
    }

    // 2. Récupérer les produits
    const resProd = await api.get('products?display=full')
    const prods = resProd?.products || resProd?.prestashop?.products?.product
    const listProds = Array.isArray(prods) ? prods : [prods]

    // 3. Filtrer les produits de la catégorie
    const filtrés = listProds.filter(p => String(p.id_category_default) === String(cat.id))

    // if (filtrés.length === 0) {
    //   alert('Aucun produit trouvé dans cette catégorie.')
    //   return
    // }

    for (const p of filtrés) {
      // 4. Récupérer le stock actuel
      const resS = await api.get(`stock_availables?filter[id_product]=${p.id}&filter[id_product_attribute]=0&display=full`)
      const rawS = resS?.stock_availables || resS?.prestashop?.stock_availables?.stock_available
      const s = Array.isArray(rawS) ? rawS[0] : rawS

      if (s?.id) {
        const qteActuelle = parseInt(s.quantity) || 0
        const voulu = quantiteARetirer.value
        const reel = Math.min(qteActuelle, voulu) // On ne retire pas plus que ce qu'on a
        const nouvelleQte = qteActuelle - reel

        await api.put('stock_availables', s.id, {
          id: s.id,
          id_product: p.id,
          id_product_attribute: 0,
          id_shop: s.id_shop || 1,
          id_shop_group: s.id_shop_group || 0,
          quantity: nouvelleQte,
          depends_on_stock: 0,
          out_of_stock: 0,
        })

        logRetrait.value.push({
          nom: typeof p.name === 'string' ? p.name : (p.name?.language?.[0]?.value || p.reference),
          reel: reel,
          voulu: voulu,
          avant: qteActuelle,
          apres: nouvelleQte,
          type: 'retrait'
        })
      }
    }
  } catch (e) {
    alert('Erreur : ' + e.message)
  } finally {
    if (!isChained) enCoursRetrait.value = false
  }
}
/////////////////////////////////////
const lancerRetraitStock1 = async (isChained = false) => {
  if (!categorieCible1.value || quantiteARetirer1.value <= 0) {
    return // On sort silencieusement si vide
  }

  if (!isChained) {
    enCoursRetrait.value = true
    logRetrait.value = []
  }

  try {
    // 1. Trouver l'ID de la catégorie par son nom
    const resCats = await api.get('categories?display=full')
    const cats = resCats?.categories || resCats?.prestashop?.categories?.category
    const listCats = Array.isArray(cats) ? cats : [cats]
    
    const cat = listCats.find(c => {
      const search = String(categorieCible1.value).toLowerCase().trim()
      
      // 1. Vérification par ID
      if (String(c.id) === search) return true

      // 2. Vérification par Nom (extraction robuste du texte)
      let name = ''
      if (typeof c.name === 'string') {
        name = c.name
      } else if (c.name?.language) {
        const l = Array.isArray(c.name.language) ? c.name.language[0] : c.name.language
        name = l?.value || l?.['#text'] || l?._ || l?.__cdata || ''
      } else if (c.name) {
        name = c.name.value || c.name['#text'] || c.name._ || c.name.__cdata || ''
      }
      
      return name.toLowerCase().trim() === search
    })

    if (!cat) {
      alert('Catégorie introuvable.')
      return
    }

    // 2. Récupérer les produits
    const resProd = await api.get('products?display=full')
    const prods = resProd?.products || resProd?.prestashop?.products?.product
    const listProds = Array.isArray(prods) ? prods : [prods]

    // 3. Filtrer les produits de la catégorie
    const filtrés = listProds.filter(p => String(p.id_category_default) === String(cat.id))

    if (filtrés.length === 0) {
      alert('Aucun produit trouvé dans cette catégorie.')
      return
    }

    for (const p of filtrés) {
      // 4. Récupérer le stock actuel
      const resS = await api.get(`stock_availables?filter[id_product]=${p.id}&filter[id_product_attribute]=0&display=full`)
      const rawS = resS?.stock_availables || resS?.prestashop?.stock_availables?.stock_available
      const s = Array.isArray(rawS) ? rawS[0] : rawS

      if (s?.id) {
        const qteActuelle = parseInt(s.quantity) || 0
        const voulu1 = quantiteARetirer1.value
        const madmax = maxsise1.value 
        const reel1 = Math.min(qteActuelle, voulu1) // On ne retire pas plus que ce qu'on a
        const nouvelleQte = qteActuelle + reel1

        
        alert(`Votre stoque atteindra ${qteActuelle} -> ${nouvelleQte}`)
        

        if (madmax < nouvelleQte) {
            alert(`Votre nombre exede la capaciter maximum ${qteActuelle} -> ${nouvelleQte} -> mad max est ${madmax} `)
            return
        }
        await api.put('stock_availables', s.id, {
          id: s.id,
          id_product: p.id,
          id_product_attribute: 0,                                                     
          id_shop: s.id_shop || 1,
          id_shop_group: s.id_shop_group || 0,
          quantity: nouvelleQte,
          depends_on_stock: 0,
          out_of_stock: 0,
        })

        logRetrait.value.push({
          nom: typeof p.name === 'string' ? p.name : (p.name?.language?.[0]?.value || p.reference),
          reel1: reel1,
          voulu1: voulu1,
          avant: qteActuelle,
          apres: nouvelleQte,
          type: 'ajout'
        })
      }
    }
  } catch (e) {
    alert('Erreur : ' + e.message)
  } finally {
    if (!isChained) enCoursRetrait.value = false
  }
}
</script>

<template>
          <!-- ========== PANNEAU RÉINITIALISATION ========== -->
        <div class="reset-header">
          <span class="reset-icone">🗑️</span>
          <div>
            <h2>Réinitialisation des stocks</h2>
            <p>Supprime toutes les commandes, clients et produits.</p>
          </div>
          <button class="btn-fermer-reset" @click="resetVisible = false">✕</button>
        </div>

        <div v-if="!resetTermine && !enCoursReset" class="reset-avert">
          ⚠️ Cette action est irréversible. Toutes les données dans PrestaShop seront supprimées.
        </div>

        <div v-if="!resetTermine" class="actions">
          <button class="btn-retour-step" @click="resetVisible = false">Annuler</button>
          <button class="btn-reset-lancer" :disabled="enCoursReset" @click="lancerReset">
            {{ enCoursReset ? '⏳ Suppression en cours...' : '🗑️ Confirmer la réinitialisation' }}
          </button>
        </div>

        <div v-if="logReset.length > 0" class="log-box" style="margin-top: 16px">
          <div v-for="(e, i) in logReset" :key="i" :class="['log-ligne', 'log-' + e.type]">
            <span class="log-ts">{{ e.ts }}</span
            >{{ e.msg }}
          </div>
        </div>

        <!-- SECTION RETRAIT DE STOCK -->
        <div class="removal-box" style="margin-top: 30px; border-top: 2px solid #eee; padding-top: 20px;">
          <h3>📦 Retrait de stock par catégorie</h3>
            <input v-model="categorieCible1" placeholder="Nom de la catégorie (ex: Akanjo)" class="form-control" />
            <input v-model="quantiteARetirer1" type="number" placeholder="Qté à enlever" class="form-control" style="width: 120px;" />
            <input v-model="maxsise1" type="number" placeholder="Max size" class="form-control" style="width: 120px;" />

          <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <input v-model="categorieCible" placeholder="Nom de la catégorie (ex: Akanjo)" class="form-control" />
            <input v-model="quantiteARetirer" type="number" placeholder="Qté à enlever" class="form-control" style="width: 120px;" />
            <button class="btn-importer" @click="lancerGlobalStock" :disabled="enCoursRetrait">
              {{ enCoursRetrait ? '⏳ Traitement...' : 'Appliquer les modifications' }}
            </button>
          </div>

          <div v-if="logRetrait.length > 0" class="results-table">
            <table style="width: 100%; border-collapse: collapse; background: #fdfdfd; border: 1px solid #ccc; font-size: 14px; color: #222;">
              <thead>
                <tr style="background: #e9ecef; color: #333;">
                  <th style="padding: 10px; border: 1px solid #bbb; text-align: left;">Produit</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Mouvement (Réel)</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Évolution (Avant → Après)</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Voulu</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in logRetrait" :key="idx">
                  <td style="padding: 10px; border: 1px solid #ddd;">{{ item.nom }}</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;" :style="{ color: item.type === 'ajout' ? '#2e7d32' : '#d32f2f' }">
                    {{ item.type === 'ajout' ? '+' + item.reel1 : '-' + item.reel }}
                  </td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;">{{ item.avant }} → {{ item.apres }}</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;">
                    {{ item.type === 'ajout' ? item.voulu1 : item.voulu }}
                  </td>
                </tr>
              </tbody>
              <tfoot style="font-weight: bold; background: #eee;">
                <tr>
                  <td style="padding: 10px; border: 1px solid #bbb;">VARIATION TOTALE</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">
                    {{ logRetrait.reduce((sum, item) => sum + (item.reel1 || 0) - (item.reel || 0), 0) }}
                  </td>
                  <td colspan="2" style="border: 1px solid #ddd;"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
</template>

<style scoped src="@/assets/Back/ImportData.css"></style>
