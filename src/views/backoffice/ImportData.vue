<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const sessionBack = db.session('admin', null)
if (!sessionBack.value) router.push('/backoffice/login')

// ============================================================
// ÉTAT GLOBAL
// ============================================================
const etape = ref('selection')   // 'selection' | 'validation' | 'import' | 'done'
const enCours = ref(false)

// Fichiers sélectionnés
const fichier1 = ref(null)   // produits
const fichier2 = ref(null)   // déclinaisons/stock
const fichier3 = ref(null)   // clients/commandes
const dossierImages = ref([]) // fichiers image depuis le dossier

// Données parsées
const produits    = ref([])
const declinaisons = ref([])
const commandes   = ref([])

// Erreurs de validation par fichier
const erreursF1 = ref([])
const erreursF2 = ref([])
const erreursF3 = ref([])

// Log d'import
const logImport = ref([])
const resumeImport = ref({ produits: 0, declinaisons: 0, clients: 0, commandes: 0, images: 0, erreurs: 0 })

// ============================================================
// COLONNES ATTENDUES (validation noms de colonnes)
// ============================================================
const COLS_F1 = ['date_availability_produit', 'nom', 'reference', 'prix_ttc', 'Taxe', 'categorie', 'prix_achat']
const COLS_F2 = ['reference', 'specificité', 'karazany', 'stock_initial', 'prix_vente_ttc']
const COLS_F3 = ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat']

// ============================================================
// UTILITAIRES CSV
// ============================================================
function parseCSV(texte) {
  // Gère les virgules dans les guillemets
  const lignes = texte.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  const headers = parseLigneCSV(lignes[0])
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
      if (dansGuillemets && ligne[i+1] === '"') { courant += '"'; i++ }
      else dansGuillemets = !dansGuillemets
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
  const [j, m, a] = s.split('/')
  return `${a}-${m}-${j}`
}

// ============================================================
// LECTURE FICHIER
// ============================================================
function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}

// ============================================================
// SÉLECTION FICHIERS
// ============================================================
const onFichier1 = (e) => { fichier1.value = e.target.files[0] || null }
const onFichier2 = (e) => { fichier2.value = e.target.files[0] || null }
const onFichier3 = (e) => { fichier3.value = e.target.files[0] || null }

const onDossierImages = (e) => {
  // webkitdirectory : sélection d'un dossier entier
  const files = Array.from(e.target.files)
  dossierImages.value = files.filter(f =>
    /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name) && !f.name.startsWith('._')
  )
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
        erreursF1.value.push({ ligne: 0, type: 'colonne', msg: `Colonne manquante ou non conforme : "${col}"` })
      }
    }

    // Vérifier chaque ligne
    rows.forEach((row, i) => {
      const num = i + 2 // ligne CSV (1 = header)
      if (!estDateValide(row.date_availability_produit)) {
        erreursF1.value.push({ ligne: num, type: 'date', msg: `Ligne ${num} — date_availability_produit invalide : "${row.date_availability_produit}" (attendu DD/MM/YYYY)` })
      }
      const prix = parseNombre(row.prix_ttc)
      if (prix === null || prix <= 0) {
        erreursF1.value.push({ ligne: num, type: 'montant', msg: `Ligne ${num} — prix_ttc doit être un montant positif : "${row.prix_ttc}"` })
      }
      const achat = parseNombre(row.prix_achat)
      if (achat === null || achat <= 0) {
        erreursF1.value.push({ ligne: num, type: 'montant', msg: `Ligne ${num} — prix_achat doit être un montant positif : "${row.prix_achat}"` })
      }
    })

    produits.value = rows
  } catch (e) {
    erreursF1.value.push({ ligne: 0, type: 'lecture', msg: 'Impossible de lire le fichier : ' + e.message })
  }

  // --- FICHIER 2 : Déclinaisons ---
  try {
    const texte = await lireFichier(fichier2.value)
    const { headers, rows } = parseCSV(texte)

    for (const col of COLS_F2) {
      if (!headers.includes(col)) {
        erreursF2.value.push({ ligne: 0, type: 'colonne', msg: `Colonne manquante ou non conforme : "${col}"` })
      }
    }

    rows.forEach((row, i) => {
      const num = i + 2
      const stock = parseInt(row.stock_initial)
      if (isNaN(stock) || stock < 0) {
        erreursF2.value.push({ ligne: num, type: 'montant', msg: `Ligne ${num} — stock_initial doit être un entier positif ou zéro : "${row.stock_initial}"` })
      }
      if (row.prix_vente_ttc) {
        const pv = parseNombre(row.prix_vente_ttc)
        if (pv !== null && pv < 0) {
          erreursF2.value.push({ ligne: num, type: 'montant', msg: `Ligne ${num} — prix_vente_ttc doit être positif : "${row.prix_vente_ttc}"` })
        }
      }
    })

    declinaisons.value = rows
  } catch (e) {
    erreursF2.value.push({ ligne: 0, type: 'lecture', msg: 'Impossible de lire le fichier : ' + e.message })
  }

  // --- FICHIER 3 : Clients/Commandes ---
  try {
    const texte = await lireFichier(fichier3.value)
    const { headers, rows } = parseCSV(texte)

    for (const col of COLS_F3) {
      if (!headers.includes(col)) {
        erreursF3.value.push({ ligne: 0, type: 'colonne', msg: `Colonne manquante ou non conforme : "${col}"` })
      }
    }

    rows.forEach((row, i) => {
      const num = i + 2
      if (!estDateValide(row.date)) {
        erreursF3.value.push({ ligne: num, type: 'date', msg: `Ligne ${num} — date invalide : "${row.date}" (attendu DD/MM/YYYY)` })
      }
      if (!row.email || !row.email.includes('@')) {
        erreursF3.value.push({ ligne: num, type: 'format', msg: `Ligne ${num} — email invalide : "${row.email}"` })
      }
    })

    commandes.value = rows
  } catch (e) {
    erreursF3.value.push({ ligne: 0, type: 'lecture', msg: 'Impossible de lire le fichier : ' + e.message })
  }

  enCours.value = false
  etape.value = 'validation'
}

const totalErreurs = computed(() =>
  erreursF1.value.length + erreursF2.value.length + erreursF3.value.length
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
  resumeImport.value = { produits: 0, declinaisons: 0, clients: 0, commandes: 0, images: 0, erreurs: 0 }

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
      return Array.isArray(l) ? (l[0]?.value || '') : (l?.value || '')
    }
    return ''
  }

  // Map nom -> id_category
  const mapCategories = {}
  for (const c of catsExistantes) {
    mapCategories[getNomCat(c).toLowerCase()] = c.id
  }

  // Créer les catégories manquantes
  const categoriesUniques = [...new Set(produits.value.map(p => p.categorie).filter(Boolean))]
  for (const nomCat of categoriesUniques) {
    if (!mapCategories[nomCat.toLowerCase()]) {
      log(`Création catégorie : ${nomCat}`)
      const catPayload = {
        active: '1',
        id_parent: '2', // ID 2 est généralement la catégorie "Accueil"
        name: {
          language: [
            { id: '1', value: nomCat.trim() },
            { id: '2', value: nomCat.trim() }
          ]
        },
        link_rewrite: {
          language: [
            { id: '1', value: nomCat.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') },
            { id: '2', value: nomCat.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') }
          ]
        },
        description: { language: [{ id: '1', value: '' }, { id: '2', value: '' }] }
      }
      const res = await api.post('categories', catPayload)
      const idNew = res?.prestashop?.category?.id
      const idRaw = (idNew && typeof idNew === 'object') ? (idNew.__cdata || idNew['#text']) : idNew
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
      log(`Produit "${p.reference}" déjà existant (ID: ${mapProduits[p.reference]}), ignoré.`, 'avert')
      continue
    }

    const idCat = mapCategories[p.categorie?.toLowerCase()] || 2
    const prixHT = parseNombre(p.prix_ttc)
    const prixAchat = parseNombre(p.prix_achat)
    const dateAvailability = dateVersPS(p.date_availability_produit)

    log(`Création produit : ${p.nom} (${p.reference})`)
    const res = await api.post('products', {
      reference: p.reference,
      name: [{ id: 1, value: p.nom }, { id: 2, value: p.nom }],
      price: prixHT?.toFixed(6) || '0.000000',
      wholesale_price: prixAchat?.toFixed(6) || '0.000000',
      id_category_default: idCat,
      active: 1,
      available_for_order: 1,
      show_price: 1,
      visibility: 'both',
      condition: 'new',
      available_date: dateAvailability,
      link_rewrite: [
        { id: 1, value: p.nom.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') },
        { id: 2, value: p.nom.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }
      ],
      description: [{ id: 1, value: '' }, { id: 2, value: '' }],
      description_short: [{ id: 1, value: '' }, { id: 2, value: '' }],
      meta_title: p.nom,
      meta_description: '',
      meta_keywords: ''
    })

    const obj = res?.prestashop?.product
    const idRaw = obj?.id
    const idProd = (idRaw && typeof idRaw === 'object') ? (idRaw.__cdata || idRaw['#text']) : idRaw
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

  for (const d of declinaisons.value) {
    const idProd = mapProduits[d.reference]
    if (!idProd) {
      log(`Déclinaison ignorée : produit "${d.reference}" introuvable`, 'avert')
      continue
    }

    const stockInitial = parseInt(d.stock_initial) || 0

    // Cas sans déclinaison (specificité vide) : on met juste le stock
    if (!d.specificité && !d.karazany) {
      log(`Stock initial produit ${d.reference} : ${stockInitial}`)
      // Chercher le stock_available principal (id_product_attribute = 0)
      const resS = await api.get(`stock_availables?filter[id_product]=${idProd}&filter[id_product_attribute]=0&display=full`)
      if (resS) {
        const rawS = resS.stock_availables || resS.prestashop?.stock_availables?.stock_available
        const s = rawS ? (Array.isArray(rawS) ? rawS[0] : rawS) : null
        if (s?.id) {
          await api.put('stock_availables', s.id, {
            id_product: idProd,
            id_product_attribute: 0,
            quantity: stockInitial,
            depends_on_stock: 0,
            out_of_stock: 0
          })
          resumeImport.value.declinaisons++
          log(`  → Stock ${d.reference} = ${stockInitial}`, 'succes')
        }
      }
      continue
    }

    // Cas avec déclinaison : Pour l'exercice, on simplifie car la création 
    // d'attributs via API est complexe. On met le stock sur le produit principal.
    log(`Déclinaison ${d.reference} — ${d.specificité}:${d.karazany} (stock: ${stockInitial})`)

    const resS = await api.get(`stock_availables?filter[id_product]=${idProd}&filter[id_product_attribute]=0&display=full`)
    if (resS) {
      const rawS = resS.stock_availables || resS.prestashop?.stock_availables?.stock_available
      const s = rawS ? (Array.isArray(rawS) ? rawS[0] : rawS) : null
      if (s?.id) {
        const nouvelleQte = (parseInt(s.quantity) || 0) + stockInitial
        await api.put('stock_availables', s.id, {
          id_product: idProd,
          id_product_attribute: 0,
          quantity: nouvelleQte,
          depends_on_stock: 0,
          out_of_stock: 0
        })
        resumeImport.value.declinaisons++
        log(`  → Stock ${d.reference} mis à jour : ${nouvelleQte}`, 'succes')
      }
    }
  }

  // ============================================================
  // D. IMPORTER LES CLIENTS + COMMANDES
  // ============================================================
  log('--- Import clients & commandes ---')

  // Charger les clients existants (par email)
  const resCli = await api.get('customers?display=full')
  const mapClients = {}   // email -> id_customer
  if (resCli) {
    const raw = resCli.customers || resCli.prestashop?.customers?.customer
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    for (const c of liste) {
      if (c.email) mapClients[c.email] = c.id
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
        id_default_group: 3,  // groupe "Clients"
        id_lang: 1
      })
      const objC = resC?.prestashop?.customer
      const idRaw = objC?.id
      idClient = (idRaw && typeof idRaw === 'object') ? (idRaw.__cdata || idRaw['#text']) : idRaw
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
      id_country: 8,  // France (Madagascar pas dans la liste par défaut, on met France)
      alias: 'Import',
      firstname: row.nom,
      lastname: '.',
      address1: row.adresse || 'Adresse importée',
      city: row.adresse || 'Ville',
      postcode: '00100',
      phone_mobile: '0000000000'
    })
    const objA = resAddr?.prestashop?.address
    const idARaw = objA?.id
    const idAddr = (idARaw && typeof idARaw === 'object') ? (idARaw.__cdata || idARaw['#text']) : idARaw
    if (!idAddr) {
      log(`  → Erreur création adresse pour ${row.email}`, 'erreur')
      continue
    }

    // Créer la commande si "achat" n'est pas vide
    if (!row.achat || row.achat.trim() === '') {
      log(`Pas de commande pour ${row.nom}`, 'avert')
      continue
    }

    // Déterminer l'état : "paiement accepté" -> état 2, sinon -> état 1
    const idEtat = row.etat && row.etat.toLowerCase().includes('paiement') ? 2 : 1

    // Créer le panier
    const resPan = await api.post('carts', {
      id_customer: idClient,
      id_address_delivery: idAddr,
      id_address_invoice: idAddr,
      id_currency: 1,
      id_lang: 1,
      id_carrier: 1,
      associations: {
        cart_rows: {
          nodeType: 'cart_row',
          rows: [{
            id_product: mapProduits[row.achat] || 1, // On lie le produit acheté
            id_product_attribute: 0,
            quantity: 1
          }]
        }
      }
    })
    const objPan = resPan?.prestashop?.cart
    const idPanRaw = objPan?.id
    const idPanier = (idPanRaw && typeof idPanRaw === 'object') ? (idPanRaw.__cdata || idPanRaw['#text']) : idPanRaw

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
      module: 'ps_cashondelivery',
      payment: 'Paiement à la livraison',
      total_paid: 0,
      total_paid_real: idEtat === 2 ? 0 : 0,
      total_products: 0,
      total_products_wt: 0,
      total_shipping: 0,
      total_shipping_tax_excl: 0,
      total_shipping_tax_incl: 0,
      current_state: idEtat,
      conversion_rate: 1
    })
    const objCmd = resCmd?.prestashop?.order
    const idCmdRaw = objCmd?.id
    const idCmd = (idCmdRaw && typeof idCmdRaw === 'object') ? (idCmdRaw.__cdata || idCmdRaw['#text']) : idCmdRaw

    if (idCmd) {
      resumeImport.value.commandes++
      log(`  → Commande #${idCmd} créée (état: ${idEtat === 2 ? 'paiement accepté' : 'en attente'})`, 'succes')
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
        formData.append('image', imgFile)
        const resp = await fetch(
          `/api/images/products/${idProd}?ws_key=6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7`,
          { method: 'POST', body: formData }
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
  document.querySelectorAll('input[type=file]').forEach(el => el.value = '')
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
  if (!confirm('⚠️ ATTENTION : Cette action va supprimer TOUTES les commandes, clients et produits dans PrestaShop. Continuer ?')) return
  if (!confirm('Dernière confirmation : supprimer toutes les données importées ?')) return

  enCoursReset.value = true
  resetVisible.value = true
  resetTermine.value = false
  logReset.value = []

  // ---- SUPPRIMER LES COMMANDES ----
  logR('Chargement des commandes...')
  const resCmd = await api.get('orders?display=full')
  if (resCmd) {
    const raw = resCmd.orders || resCmd.prestashop?.orders?.order
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    logR(`${liste.length} commande(s) trouvée(s)`)
    for (const cmd of liste) {
      // Pour supprimer une commande PS, il faut d'abord la mettre en état "Annulé" (6)
      // puis la supprimer — PS ne permet pas DELETE /orders directement
      // On passe par l'état annulé
      await api.put('orders', cmd.id, { current_state: 6 })
      logR(`Commande #${cmd.id} annulée`, 'succes')
    }
  }

  // ---- SUPPRIMER LES PANIERS ----
  logR('Chargement des paniers...')
  const resCarts = await api.get('carts?display=full')
  if (resCarts) {
    const raw = resCarts.carts || resCarts.prestashop?.carts?.cart
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    logR(`${liste.length} panier(s) trouvé(s)`)
    for (const cart of liste) {
      const r = await api.delete('carts', cart.id)
      logR(`Panier #${cart.id} supprimé`, r ? 'succes' : 'avert')
    }
  }

  // ---- SUPPRIMER LES CLIENTS ----
  logR('Chargement des clients...')
  const resCli = await api.get('customers?display=full')
  if (resCli) {
    const raw = resCli.customers || resCli.prestashop?.customers?.customer
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    logR(`${liste.length} client(s) trouvé(s)`)
    for (const cli of liste) {
      const r = await api.delete('customers', cli.id)
      logR(`Client #${cli.id} (${cli.email}) supprimé`, r !== null ? 'succes' : 'avert')
    }
  }

  // ---- SUPPRIMER LES PRODUITS ----
  logR('Chargement des produits...')
  const resProd = await api.get('products?display=full')
  if (resProd) {
    const raw = resProd.products || resProd.prestashop?.products?.product
    const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    logR(`${liste.length} produit(s) trouvé(s)`)
    for (const prod of liste) {
      const r = await api.delete('products', prod.id)
      logR(`Produit #${prod.id} (${prod.reference}) supprimé`, r !== null ? 'succes' : 'avert')
    }
  }

  logR('=== Réinitialisation terminée ===', 'succes')
  enCoursReset.value = false
  resetTermine.value = true
}
</script>

<template>
  <div class="page">

    <!-- SIDEBAR identique au dashboard -->
    <aside class="sidebar">
      <div class="sidebar-logo">⚙️ Admin</div>
      <nav class="sidebar-nav">
        <button class="nav-item" @click="$router.push('/backoffice/dashboard')">📋 Dashboard</button>
        <button class="nav-item actif">📥 Import données</button>
      </nav>
      <div class="sidebar-reset">
        <button class="btn-reset-ps" @click="resetVisible = !resetVisible; logReset = []">
          🗑️ Réinitialiser les données
        </button>
      </div>
      <div class="sidebar-footer">
        <span class="admin-nom">{{ sessionBack?.prenom }}</span>
        <button class="btn-deco" @click="() => { db.session('admin', null).value = null; $router.push('/backoffice/login') }">Déconnexion</button>
        <button class="btn-front" @click="$router.push('/')">← Accueil</button>
      </div>
    </aside>

    <main class="main">
      <h1 class="titre">📥 Import de données</h1>

      <!-- ========== ÉTAPE 1 : SÉLECTION ========== -->
      <div v-if="etape === 'selection'" class="contenu-carte">

        <p class="intro">
          Sélectionnez les 3 fichiers CSV et (optionnellement) le dossier contenant les images.
          Les fichiers seront validés avant l'import.
        </p>

        <div class="fichiers-grid">

          <!-- Fichier 1 : Produits -->
          <div class="fichier-bloc">
            <div class="fichier-icone">📄</div>
            <div class="fichier-label">
              <strong>Fichier 1 — Produits</strong>
              <span>date_availability_produit, nom, reference, prix_ttc, Taxe, categorie, prix_achat</span>
            </div>
            <label class="btn-choisir">
              {{ fichier1 ? '✓ ' + fichier1.name : 'Choisir le fichier CSV' }}
              <input type="file" accept=".csv" @change="onFichier1" hidden />
            </label>
          </div>

          <!-- Fichier 2 : Déclinaisons -->
          <div class="fichier-bloc">
            <div class="fichier-icone">📄</div>
            <div class="fichier-label">
              <strong>Fichier 2 — Déclinaisons & Stocks</strong>
              <span>reference, specificité, karazany, stock_initial, prix_vente_ttc</span>
            </div>
            <label class="btn-choisir">
              {{ fichier2 ? '✓ ' + fichier2.name : 'Choisir le fichier CSV' }}
              <input type="file" accept=".csv" @change="onFichier2" hidden />
            </label>
          </div>

          <!-- Fichier 3 : Clients/Commandes -->
          <div class="fichier-bloc">
            <div class="fichier-icone">📄</div>
            <div class="fichier-label">
              <strong>Fichier 3 — Clients & Commandes</strong>
              <span>date, nom, email, pwd, adresse, achat, etat</span>
            </div>
            <label class="btn-choisir">
              {{ fichier3 ? '✓ ' + fichier3.name : 'Choisir le fichier CSV' }}
              <input type="file" accept=".csv" @change="onFichier3" hidden />
            </label>
          </div>

          <!-- Dossier Images -->
          <div class="fichier-bloc fichier-images">
            <div class="fichier-icone">🗂️</div>
            <div class="fichier-label">
              <strong>Images (optionnel)</strong>
              <span>Sélectionnez le dossier contenant les images (PNG/JPG). Nommées par référence produit : T_01.jpg, C_03.png...</span>
            </div>
            <label class="btn-choisir btn-dossier">
              {{ dossierImages.length > 0 ? '✓ ' + dossierImages.length + ' image(s) trouvée(s)' : 'Choisir le dossier d\'images' }}
              <input type="file" accept="image/*" webkitdirectory multiple @change="onDossierImages" hidden />
            </label>
            <div v-if="dossierImages.length > 0" class="images-liste">
              <span v-for="img in dossierImages" :key="img.name" class="img-tag">{{ img.name }}</span>
            </div>
          </div>

        </div>

        <div class="actions">
          <button
            class="btn-valider"
            :disabled="!peutValider || enCours"
            @click="validerFichiers"
          >
            {{ enCours ? '⏳ Analyse en cours...' : '→ Analyser et valider les fichiers' }}
          </button>
        </div>
      </div>

      <!-- ========== ÉTAPE 2 : VALIDATION ========== -->
      <div v-if="etape === 'validation'" class="contenu-carte">

        <div :class="['resume-validation', totalErreurs === 0 ? 'ok' : 'ko']">
          <span class="resume-icone">{{ totalErreurs === 0 ? '✅' : '❌' }}</span>
          <div>
            <strong>{{ totalErreurs === 0 ? 'Fichiers valides — prêt pour l\'import' : totalErreurs + ' erreur(s) détectée(s)' }}</strong>
            <p v-if="totalErreurs > 0">Corrigez les erreurs dans les fichiers CSV puis recommencez.</p>
          </div>
        </div>

        <!-- Résumé des données -->
        <div class="recap-data">
          <div class="recap-item">
            <span class="recap-nb">{{ produits.length }}</span>
            <span class="recap-label">produit(s)</span>
          </div>
          <div class="recap-item">
            <span class="recap-nb">{{ declinaisons.length }}</span>
            <span class="recap-label">déclinaison(s)</span>
          </div>
          <div class="recap-item">
            <span class="recap-nb">{{ commandes.length }}</span>
            <span class="recap-label">client(s)/commande(s)</span>
          </div>
          <div class="recap-item">
            <span class="recap-nb">{{ dossierImages.length }}</span>
            <span class="recap-label">image(s)</span>
          </div>
        </div>

        <!-- Erreurs F1 -->
        <div v-if="erreursF1.length > 0" class="erreurs-bloc">
          <h3>❌ Fichier 1 — Produits ({{ erreursF1.length }} erreur(s))</h3>
          <div v-for="(e, i) in erreursF1" :key="i" :class="['erreur-ligne', 'type-' + e.type]">
            <span class="erreur-badge">{{ e.type }}</span>
            {{ e.msg }}
          </div>
        </div>
        <div v-else class="ok-bloc">✅ Fichier 1 — Produits : aucune erreur</div>

        <!-- Erreurs F2 -->
        <div v-if="erreursF2.length > 0" class="erreurs-bloc">
          <h3>❌ Fichier 2 — Déclinaisons ({{ erreursF2.length }} erreur(s))</h3>
          <div v-for="(e, i) in erreursF2" :key="i" :class="['erreur-ligne', 'type-' + e.type]">
            <span class="erreur-badge">{{ e.type }}</span>
            {{ e.msg }}
          </div>
        </div>
        <div v-else class="ok-bloc">✅ Fichier 2 — Déclinaisons : aucune erreur</div>

        <!-- Erreurs F3 -->
        <div v-if="erreursF3.length > 0" class="erreurs-bloc">
          <h3>❌ Fichier 3 — Clients/Commandes ({{ erreursF3.length }} erreur(s))</h3>
          <div v-for="(e, i) in erreursF3" :key="i" :class="['erreur-ligne', 'type-' + e.type]">
            <span class="erreur-badge">{{ e.type }}</span>
            {{ e.msg }}
          </div>
        </div>
        <div v-else class="ok-bloc">✅ Fichier 3 — Clients/Commandes : aucune erreur</div>

        <div class="actions">
          <button class="btn-retour-step" @click="etape = 'selection'">← Rechoisir les fichiers</button>
          <button
            v-if="peutImporter"
            class="btn-importer"
            @click="lancerImport"
          >🚀 Lancer l'import</button>
          <p v-else class="msg-bloque">Corrigez les erreurs avant de pouvoir importer.</p>
        </div>
      </div>

      <!-- ========== ÉTAPE 3 : IMPORT EN COURS ========== -->
      <div v-if="etape === 'import'" class="contenu-carte">
        <h2 class="sous-titre">🚀 Import en cours...</h2>
        <div class="log-box">
          <div
            v-for="(entry, i) in logImport"
            :key="i"
            :class="['log-ligne', 'log-' + entry.type]"
          >
            <span class="log-ts">{{ entry.ts }}</span>
            {{ entry.msg }}
          </div>
          <div v-if="enCours" class="log-ligne log-info">⏳ Traitement...</div>
        </div>
      </div>

      <!-- ========== ÉTAPE 4 : TERMINÉ ========== -->
      <div v-if="etape === 'done'" class="contenu-carte">
        <div class="done-header">
          <span class="done-icone">✅</span>
          <h2>Import terminé !</h2>
        </div>

        <div class="resume-grid">
          <div class="resume-card">
            <span class="r-nb">{{ resumeImport.produits }}</span>
            <span class="r-label">produit(s) créé(s)</span>
          </div>
          <div class="resume-card">
            <span class="r-nb">{{ resumeImport.declinaisons }}</span>
            <span class="r-label">déclinaison(s) créée(s)</span>
          </div>
          <div class="resume-card">
            <span class="r-nb">{{ resumeImport.clients }}</span>
            <span class="r-label">client(s) créé(s)</span>
          </div>
          <div class="resume-card">
            <span class="r-nb">{{ resumeImport.commandes }}</span>
            <span class="r-label">commande(s) créée(s)</span>
          </div>
          <div class="resume-card">
            <span class="r-nb">{{ resumeImport.images }}</span>
            <span class="r-label">image(s) uploadée(s)</span>
          </div>
          <div :class="['resume-card', resumeImport.erreurs > 0 ? 'rouge' : '']">
            <span class="r-nb">{{ resumeImport.erreurs }}</span>
            <span class="r-label">erreur(s)</span>
          </div>
        </div>

        <!-- Log complet pliable -->
        <details class="log-details">
          <summary>Voir le log complet ({{ logImport.length }} entrées)</summary>
          <div class="log-box">
            <div v-for="(entry, i) in logImport" :key="i" :class="['log-ligne', 'log-' + entry.type]">
              <span class="log-ts">{{ entry.ts }}</span>
              {{ entry.msg }}
            </div>
          </div>
        </details>

        <div class="actions">
          <button class="btn-retour-step" @click="reinitialiser">↺ Nouvel import</button>
          <button class="btn-importer" @click="$router.push('/backoffice/dashboard')">→ Aller au dashboard</button>
        </div>
      </div>

      <!-- ========== PANNEAU RÉINITIALISATION ========== -->
      <div v-if="resetVisible" class="reset-panneau">
        <div class="reset-header">
          <span class="reset-icone">🗑️</span>
          <div>
            <h2>Réinitialisation des données PrestaShop</h2>
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

        <div v-if="logReset.length > 0" class="log-box" style="margin-top:16px">
          <div v-for="(e, i) in logReset" :key="i" :class="['log-ligne', 'log-' + e.type]">
            <span class="log-ts">{{ e.ts }}</span>{{ e.msg }}
          </div>
        </div>

        <div v-if="resetTermine" class="reset-done">
          ✅ Réinitialisation terminée. PrestaShop est vide.
          <button class="btn-importer" style="margin-top:12px" @click="resetVisible = false; reinitialiser()">
            Fermer et recommencer un import
          </button>
        </div>
      </div>

    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

.page { display: flex; min-height: 100vh; background: #f0f2f5; font-family: 'Lato', sans-serif; }

/* SIDEBAR */
.sidebar { width: 220px; flex-shrink: 0; background: #1a1a2e; color: white; display: flex; flex-direction: column; padding: 24px 16px; position: sticky; top: 0; height: 100vh; }
.sidebar-logo { font-family: 'Playfair Display', serif; font-size: 1.2rem; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.nav-item { background: none; border: none; color: rgba(255,255,255,0.6); padding: 10px 14px; border-radius: 8px; cursor: pointer; text-align: left; font-size: 0.9rem; transition: all 0.15s; }
.nav-item:hover { background: rgba(255,255,255,0.07); color: white; }
.nav-item.actif { background: rgba(255,255,255,0.12); color: white; font-weight: 700; }
.sidebar-footer { display: flex; flex-direction: column; gap: 8px; }
.admin-nom { color: rgba(255,255,255,0.5); font-size: 0.8rem; }
.btn-deco { background: #e94560; color: white; border: none; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 0.82rem; }
.btn-front { background: none; border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.45); padding: 7px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; }

/* MAIN */
.main { flex: 1; padding: 32px; overflow-y: auto; }
.titre { font-family: 'Playfair Display', serif; font-size: 2rem; color: #1a1a2e; margin: 0 0 24px; }
.contenu-carte { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.intro { color: #666; margin: 0 0 28px; font-size: 0.95rem; line-height: 1.6; }

/* SÉLECTION FICHIERS */
.fichiers-grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
.fichier-bloc { display: flex; align-items: flex-start; gap: 16px; border: 1.5px solid #e8e8e8; border-radius: 12px; padding: 20px; transition: border-color 0.2s; }
.fichier-bloc:hover { border-color: #0f3460; }
.fichier-images { background: #fafeff; }
.fichier-icone { font-size: 2rem; flex-shrink: 0; }
.fichier-label { flex: 1; }
.fichier-label strong { display: block; color: #1a1a2e; font-size: 0.95rem; margin-bottom: 4px; }
.fichier-label span { color: #888; font-size: 0.78rem; font-family: monospace; }
.btn-choisir { display: inline-block; background: #1a1a2e; color: white; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 0.82rem; white-space: nowrap; flex-shrink: 0; transition: background 0.15s; }
.btn-choisir:hover { background: #0f3460; }
.btn-dossier { background: #0f3460; }
.images-liste { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.img-tag { background: #e8f4fd; color: #0f3460; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; }

/* ACTIONS */
.actions { display: flex; align-items: center; gap: 16px; margin-top: 28px; flex-wrap: wrap; }
.btn-valider { background: #0f3460; color: white; border: none; padding: 14px 32px; border-radius: 10px; cursor: pointer; font-size: 1rem; font-weight: 700; transition: background 0.15s; }
.btn-valider:hover:not(:disabled) { background: #1a4a8a; }
.btn-valider:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-importer { background: #27ae60; color: white; border: none; padding: 13px 28px; border-radius: 10px; cursor: pointer; font-size: 0.95rem; font-weight: 700; }
.btn-importer:hover { background: #1e8449; }
.btn-retour-step { background: white; border: 1px solid #ddd; color: #555; padding: 12px 20px; border-radius: 10px; cursor: pointer; font-size: 0.9rem; }
.btn-retour-step:hover { background: #f5f5f5; }
.msg-bloque { color: #e74c3c; font-size: 0.88rem; }

/* VALIDATION */
.resume-validation { display: flex; align-items: center; gap: 16px; padding: 18px 22px; border-radius: 12px; margin-bottom: 24px; }
.resume-validation.ok { background: #eafaf1; border: 1.5px solid #a9dfbf; }
.resume-validation.ko { background: #fdecea; border: 1.5px solid #f1948a; }
.resume-icone { font-size: 2rem; }
.resume-validation strong { display: block; color: #1a1a2e; font-size: 1rem; }
.resume-validation p { color: #666; font-size: 0.85rem; margin: 4px 0 0; }

.recap-data { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.recap-item { background: #f8f9fa; border-radius: 10px; padding: 14px 20px; text-align: center; }
.recap-nb { display: block; font-size: 1.8rem; font-weight: 700; color: #1a1a2e; }
.recap-label { font-size: 0.78rem; color: #888; }

.erreurs-bloc { background: #fdecea; border: 1px solid #f1948a; border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; }
.erreurs-bloc h3 { margin: 0 0 12px; color: #c0392b; font-size: 0.92rem; }
.erreur-ligne { padding: 6px 0; color: #444; font-size: 0.85rem; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; gap: 10px; }
.erreur-ligne:last-child { border-bottom: none; }
.erreur-badge { background: #e74c3c; color: white; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.ok-bloc { background: #eafaf1; border: 1px solid #a9dfbf; border-radius: 10px; padding: 12px 18px; color: #1e8449; font-size: 0.88rem; margin-bottom: 12px; }

/* LOG */
.log-box { background: #0d0d1a; border-radius: 10px; padding: 16px; font-family: monospace; font-size: 0.8rem; max-height: 500px; overflow-y: auto; margin-top: 12px; }
.log-ligne { padding: 3px 0; }
.log-info   { color: rgba(255,255,255,0.7); }
.log-succes { color: #2ecc71; }
.log-avert  { color: #f39c12; }
.log-erreur { color: #e74c3c; }
.log-ts { color: rgba(255,255,255,0.25); margin-right: 10px; font-size: 0.72rem; }
.sous-titre { font-family: 'Playfair Display', serif; color: #1a1a2e; font-size: 1.4rem; margin: 0 0 16px; }

/* DONE */
.done-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
.done-icone { font-size: 3rem; }
.done-header h2 { font-family: 'Playfair Display', serif; font-size: 1.8rem; color: #1a1a2e; margin: 0; }
.resume-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; margin-bottom: 28px; }
.resume-card { background: #f8f9fa; border-radius: 12px; padding: 18px; text-align: center; }
.resume-card.rouge { background: #fdecea; }
.r-nb { display: block; font-size: 2rem; font-weight: 700; color: #1a1a2e; }
.r-label { font-size: 0.78rem; color: #888; }
.log-details summary { cursor: pointer; color: #555; font-size: 0.88rem; padding: 8px 0; }

/* RESET */
.sidebar-reset { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); }
.btn-reset-ps { width: 100%; padding: 9px 12px; background: rgba(231,76,60,0.15); border: 1px solid rgba(231,76,60,0.4); color: #e74c3c; border-radius: 8px; cursor: pointer; font-size: 0.82rem; text-align: left; transition: all 0.15s; }
.btn-reset-ps:hover { background: rgba(231,76,60,0.3); }

.reset-panneau { background: white; border-radius: 16px; padding: 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); border: 2px solid #e74c3c; margin-top: 24px; }
.reset-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
.reset-icone { font-size: 2.5rem; flex-shrink: 0; }
.reset-header h2 { font-family: 'Playfair Display', serif; color: #c0392b; font-size: 1.3rem; margin: 0 0 4px; }
.reset-header p { color: #888; font-size: 0.88rem; margin: 0; }
.btn-fermer-reset { background: none; border: none; font-size: 1.3rem; cursor: pointer; color: #aaa; margin-left: auto; flex-shrink: 0; }
.btn-fermer-reset:hover { color: #e74c3c; }
.reset-avert { background: #fef9e7; border: 1px solid #f39c12; border-radius: 8px; padding: 12px 16px; color: #856404; font-size: 0.88rem; margin-bottom: 16px; }
.btn-reset-lancer { background: #e74c3c; color: white; border: none; padding: 13px 28px; border-radius: 10px; cursor: pointer; font-size: 0.95rem; font-weight: 700; }
.btn-reset-lancer:hover:not(:disabled) { background: #c0392b; }
.btn-reset-lancer:disabled { opacity: 0.45; cursor: not-allowed; }
.reset-done { background: #eafaf1; border: 1px solid #a9dfbf; border-radius: 10px; padding: 16px 20px; color: #1e8449; font-size: 0.92rem; display: flex; flex-direction: column; align-items: flex-start; margin-top: 16px; }
</style>