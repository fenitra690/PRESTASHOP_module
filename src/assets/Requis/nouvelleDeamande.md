Dans ImportData.vue, deux corrections :
js// LIGNE 603 — CORRECTION BUG DATE HISTORIQUE STOCK
// AVANT :
const mvtDate = infoProd?.date_availability_produit || new Date().toLocaleDateString('fr-FR')

// APRÈS : utiliser la date d'import (date du jour formatée FR), pas la date de dispo produit
const mvtDate = new Date().toLocaleDateString('fr-FR')
// Note : pour les commandes, la vraie date viendra du fichier 3. 
// Pour le stock du fichier 2, on utilise la date du jour de l'import.
js// LIGNES 790-800 — CORRECTION BUG TTC COMMANDES (calcul tauxTaxe incorrect)
// AVANT :
const taxeTexte = pBase?.Taxe || '0%'
const tauxTaxe = parseFloat(taxeTexte.replace(',', '.').replace('%', '')) / 100

// APRÈS : parser correctement "11,65%" → 0.1165
const taxeTexte = pBase?.Taxe || '0%'
const tauxTaxe = parseFloat(taxeTexte.replace(/\s/g, '').replace(',', '.').replace('%', '')) / 100
Dans Dashboard.vue, deux corrections :
js// LIGNE 205-209 — CORRECTION BUG DATE (fuseau horaire)
// AVANT :
const formatDate = (str) => {
  if (!str) return '—'
  const d = new Date(str)
  return isNaN(d) ? str : d.toLocaleDateString('fr-FR')
}

// APRÈS : parser manuellement pour éviter le décalage UTC→local
const formatDate = (str) => {
  if (!str) return '—'
  // PrestaShop renvoie "2026-05-09 12:00:00" ou "2026-05-09"
  // new Date("2026-05-09") est interprété en UTC → décalage = jour -1 en local
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }
  const d = new Date(str)
  return isNaN(d) ? str : d.toLocaleDateString('fr-FR')
}
js// LIGNES 323-330 — CORRECTION BUG TTC = HT (statistiques)
// AVANT :
const priceHT  = parseFloat(row.unit_price_tax_excl) || 0
const priceTTC = parseFloat(row.unit_price_tax_incl) || 0

if (isLivree) {
  achatTotalHT  += wsPrice * qte
  venteTotalHT  += priceHT * qte
  venteTotalTTC += priceTTC * qte
}

// APRÈS : recalculer le TTC depuis le HT + taux de taxe du produit si unit_price_tax_incl = 0
const priceHT  = parseFloat(row.unit_price_tax_excl) || 0
let   priceTTC = parseFloat(row.unit_price_tax_incl) || 0

// Fallback : si PrestaShop renvoie 0 pour tax_incl, on recalcule depuis le produit
if (priceTTC === 0 && priceHT > 0) {
  const produitCmd = produits.value.find((prod) => String(prod.id) === String(pId))
  if (produitCmd) {
    // Récupérer le taux depuis id_tax_rules_group n'est pas dispo ici,
    // on recalcule depuis total_paid vs total_products sur la commande entière
    // Fallback simple : total_products_wt / total_products * priceHT
    const ratioTTC = parseFloat(cmd.total_products_wt) > 0 && parseFloat(cmd.total_products) > 0
      ? parseFloat(cmd.total_products_wt) / parseFloat(cmd.total_products)
      : 1
    priceTTC = priceHT * ratioTTC
  }
}

if (isLivree) {
  achatTotalHT  += wsPrice * qte
  venteTotalHT  += priceHT * qte
  venteTotalTTC += priceTTC * qte
}

Résumé des causes et corrections :
BugCause racineFixTTC = HTunit_price_tax_incl retourné à 0 par PrestaShop → priceTTC tombe à 0Fallback : ratio total_products_wt / total_products de la commande × priceHTDate = aujourd'huinew Date("2026-05-09") parsé en UTC → affiché la veille en local (décalage +3h Madagascar)Parser manuellement YYYY-MM-DD sans passer par new Date()Taxe non parsée"11,65%" avec espace ou virgule mal nettoyé avant parseFloatAjouter .replace(/\s/g, '') avant le replace virgule