import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'

// Parser XML -> JSON (pour lire les réponses)
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  textNodeName: '#text'
})

const WS_KEY = '6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7'

// Client GET JSON
const apiClient = axios.create({
  baseURL: '/api',
  params: { ws_key: WS_KEY, output_format: 'JSON' }
})

// Client POST/PUT XML
const apiClientXml = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'text/xml; charset=utf-8' }
})

// ============================================================
// UTILITAIRE : construire du XML propre à partir d'un objet JS
// PrestaShop exige des éléments enfants CDATA, PAS des attributs
//
// Champs simples : { id_customer: 1, firstname: 'Jean' }
// -> <id_customer><![CDATA[1]]></id_customer>
//
// Associations (cart_rows) : passer une clé spéciale "associations"
// avec un objet décrivant les lignes :
// associations: {
//   cart_rows: {
//     nodeType: 'cart_row',
//     rows: [ { id_product: 1, id_product_attribute: 0, quantity: 2, id_address_delivery: 3 } ]
//   }
// }
// ============================================================
function objetVersXml(nomRessource, champs) {
  let lignes = ''

  for (const key in champs) {
    if (key === 'associations') continue  // traité séparément
    const val = champs[key]
    if (val === null || val === undefined) {
      lignes += `<${key}></${key}>`
    } else {
      lignes += `<${key}><![CDATA[${val}]]></${key}>`
    }
  }

  // Associations (ex: cart_rows pour les produits du panier)
  if (champs.associations) {
    lignes += '<associations>'
    for (const assocKey in champs.associations) {
      const assoc = champs.associations[assocKey]
      const nodeType = assoc.nodeType || assocKey.replace(/s$/, '')
      lignes += `<${assocKey} nodeType="${nodeType}">`
      for (let i = 0; i < assoc.rows.length; i++) {
        const row = assoc.rows[i]
        lignes += `<${nodeType}>`
        for (const rowKey in row) {
          lignes += `<${rowKey}><![CDATA[${row[rowKey]}]]></${rowKey}>`
        }
        lignes += `</${nodeType}>`
      }
      lignes += `</${assocKey}>`
    }
    lignes += '</associations>'
  }

  return `<?xml version="1.0" encoding="UTF-8"?><prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><${nomRessource}>${lignes}</${nomRessource}></prestashop>`
}

// Nom de la ressource au singulier (ex: "addresses" -> "address", "carts" -> "cart")
function singulier(resource) {
  // Cas spéciaux PrestaShop
  const exceptions = {
    addresses: 'address',
    categories: 'category',
    countries: 'country',
    currencies: 'currency',
    customers: 'customer',
    carriers: 'carrier',
    orders: 'order',
    carts: 'cart',
    products: 'product',
    combinations: 'combination',
    languages: 'language',
    taxes: 'tax',
    employees: 'employee',
    stock_availables: 'stock_available',
  }
  // Enlever les paramètres de query si présents
  const base = resource.split('?')[0]
  return exceptions[base] || base.replace(/s$/, '')
}

export default {
  // ============================================================
  // GET - retourne du JSON
  // ============================================================
  async get(resource) {
    try {
      const response = await apiClient.get(`/${resource}`)
      if (typeof response.data === 'object') return response.data
      return parser.parse(response.data)
    } catch (error) {
      console.error(`[API GET] Erreur sur ${resource}:`, error)
      return null
    }
  },

  // ============================================================
  // POST - envoie du XML pur (PrestaShop 8 refuse le JSON en POST)
  // Usage : await api.post('addresses', { id_customer: 1, firstname: 'Jean', ... })
  // ============================================================
  async post(resource, champs) {
    try {
      const nomSingulier = singulier(resource)
      const xml = objetVersXml(nomSingulier, champs)

      console.log(`[API POST] ${resource} — XML envoyé:`, xml)

      const response = await apiClientXml.post(`/${resource}?ws_key=${WS_KEY}`, xml)

      // Réponse XML -> JSON
      const resultat = parser.parse(response.data)
      console.log(`[API POST] ${resource} — Réponse:`, resultat)
      return resultat

    } catch (error) {
      // Afficher le XML d'erreur PrestaShop si disponible
      const errData = error.response?.data || error.message || error
      console.error(`[API POST] Erreur sur ${resource}:`, errData)
      return null
    }
  },

  // ============================================================
  // PUT - modifier une ressource existante
  // Usage : await api.put('orders', 5, { current_state: 2 })
  // ============================================================
  async put(resource, id, champs) {
    try {
      // Pour PUT, on doit inclure l'id dans les champs
      const champsAvecId = { id, ...champs }
      const nomSingulier = singulier(resource)
      const xml = objetVersXml(nomSingulier, champsAvecId)

      console.log(`[API PUT] ${resource}/${id} — XML envoyé:`, xml)

      const response = await apiClientXml.put(`/${resource}/${id}?ws_key=${WS_KEY}`, xml)
      return parser.parse(response.data)

    } catch (error) {
      console.error(`[API PUT] Erreur sur ${resource}/${id}:`, error.response?.data || error)
      return null
    }
  },

  // DELETE
  async delete(resource, id) {
    try {
      return (await apiClient.delete(`/${resource}/${id}`)).data
    } catch (error) {
      console.error(`[API DELETE] Erreur sur ${resource}/${id}:`, error)
      return null
    }
  }
}