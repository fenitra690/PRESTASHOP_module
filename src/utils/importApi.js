import JSZip from "jszip"; // Bibliotheque pour dezipper
import prestashopApi from "../axios"; // Client API partage
import { xmlToJs } from "../../utils/xmlParser"; // Convertisseur XML vers JS
import { appendStockHistory } from "../../utils/stockHistory";

const baseURL = import.meta.env.VITE_PRESTASHOP_BASE_URL || "/prestashop/api"; // URL API
const apiKey = import.meta.env.VITE_PRESTASHOP_API_KEY || ""; // Cle API
const langId = 1; // ID langue par defaut (francais)
const defaultCategoryId = 2; // ID categorie racine (Home)
// Multiplicateur pour convertir les prix CSV (EUR) vers la devise de la boutique
let currencyMultiplier = 1;

// resourceItemName : mappe les noms de collection vers le nom d un seul element
const resourceItemName = {
  categories: "category",
  products: "product",
  taxes: "tax",
  tax_rule_groups: "tax_rule_group",
  tax_rules: "tax_rule",
  stock_availables: "stock_available",
  product_options: "product_option",
  product_option_values: "product_option_value",
  combinations: "combination",
  countries: "country"
};

// Caches en memoire pour eviter les appels repetes pendant un import
const importCache = {
  categories: new Map(),
  taxes: new Map(),
  taxRuleGroups: new Map(),
  attributeGroups: new Map(),
  attributeValues: new Map(),
  countries: new Map()
};

// Helper interne pour extraire une valeur texte brute d'un objet xml2js
const getVal = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === 'object') {
    if (v.id) return String(v.id);
    if (v._ !== undefined) return String(v._);
    if (Array.isArray(v) && v.length > 0) return getVal(v[0]);
    return "";
  }
  return String(v);
};

// normalizeList(data, collection) : extrait un tableau d elements depuis le XML parse
function normalizeList(data, collection) {
  const key = resourceItemName[collection]; // Nom de l element
  const root = data?.prestashop || data;
  const list = root?.[collection]?.[key];
  if (!list) return []; // Pas de donnees
  return Array.isArray(list) ? list : [list]; // Force en tableau
}

// parseNumber(value) : convertit une valeur CSV en nombre
// Gere : virgule decimale (12,5), pourcentages (11,65%), espaces
function parseNumber(value) {
  if (value === null || value === undefined) return 0; // Null safety
  const clean = String(value).replace(/%/g, "").replace(/\s/g, "").replace(",", "."); // Nettoie
  const num = parseFloat(clean); // Parse en float
  return Number.isFinite(num) ? num : 0; // Retourne 0 si NaN
}

// slugify(value) : convertit un texte en URL-friendly slug
function slugify(value) {
  return String(value || "")
    .toLowerCase() // Minuscule
    .normalize("NFD") // Separe accents
    .replace(/[\u0300-\u036f]/g, "") // Retire accents
    .replace(/[^a-z0-9]+/g, "-") // Remplace les non-alphanum par tirets
    .replace(/^-+|-+$/g, "") || "produit"; // Supprime tirets de debut/fin
}

// toIsoDate(value) : convertit dd/mm/yyyy en yyyy-mm-dd
function toIsoDate(value) {
  const parts = String(value || "").split("/"); // Decoupe par /
  if (parts.length !== 3) return ""; // Format invalide
  const [dd, mm, yyyy] = parts; // Destructure
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; // Format ISO
}

// safeApiCall(fn, label, log) : execute une fonction API avec gestion d erreur
// Capture le message d erreur de PrestaShop et le log dans le journal
async function safeApiCall(fn, label, log) {
  try {
    return await fn(); // Execute la fonction
  } catch (err) {
    const status = err?.response?.status || "?"; // Code HTTP
    let errorDetail = "";
    
    // Tente d'extraire le message d'erreur du XML renvoyé par PrestaShop
    if (err?.response?.data) {
      const data = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
      if (data.includes("<message>")) {
        const match = data.match(/<message>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/message>/);
        if (match) errorDetail = ` (${match[1]})`;
      }
      if (!errorDetail) errorDetail = ` - ${data.substring(0, 100)}...`;
    }

    const msg = `❌ ${label} → Erreur ${status}${errorDetail}`;
    log.push(msg); // Ajoute au journal
    console.error(label, err); // Log console
    return null; // Retourne null en cas d erreur
  }
}

// findIdByFilter(resource, field, value) : cherche un element par filtre
// Retourne l ID du premier resultat ou null
async function findIdByFilter(resource, field, value) {
  try {
    const params = new URLSearchParams({
      display: "[id]", // Ne demande que l ID
      [`filter[${field}]`]: `[${value}]`, // Filtre par champ
      limit: "1" // Un seul resultat
    }).toString();
    const response = await prestashopApi.get(`/${resource}?${params}`, { responseType: "text" }); // Requete GET
    const data = xmlToJs(response.data); // Parse le XML
    const items = normalizeList(data, resource); // Extrait les elements
    return items[0]?.id ? Number(items[0].id) : null; // Retourne l ID ou null
  } catch (err) {
    console.warn(`findIdByFilter failed for ${resource}/${field}=${value}`, err.message);
    return null;
  }
}

// extractId(data, collection) : extrait l ID d un element apres creation ou recherche
function extractId(data, collection) {
  const root = data?.prestashop || data; // Racine XML
  const singular = resourceItemName[collection]; // Nom singulier (ex: product)
  
  // Cas 1 : Resultat d une creation (POST) -> { product: { id: 123 } }
  if (root?.[singular]?.id) return getVal(root[singular].id);
  
  // Cas 2 : Resultat d une liste (GET) -> { products: { product: { id: 123 } } }
  const list = normalizeList(data, collection);
  return list[0]?.id ? getVal(list[0].id) : null;
}

// ensureCategory(name, log) : cree la categorie si elle n existe pas
async function ensureCategory(name, log) {
  const cleanName = String(name || "").trim(); // Nettoie le nom
  if (!cleanName || cleanName === "Home" || cleanName === "Accueil") return defaultCategoryId;

  if (importCache.categories.has(cleanName)) return importCache.categories.get(cleanName);

  // 1. Cherche par nom
  let existing = await findIdByFilter("categories", "name", cleanName);
  
  // 2. Si non trouvé, cherche par link_rewrite (URL simplifiée)
  if (!existing) {
    existing = await findIdByFilter("categories", "link_rewrite", slugify(cleanName));
  }
  
  if (existing) {
    importCache.categories.set(cleanName, existing);
    return existing; // Retourne l ID existant
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <category>
    <id_parent>${defaultCategoryId}</id_parent>
    <active>1</active>
    <name><language id="${langId}"><![CDATA[${cleanName}]]></language></name>
    <link_rewrite><language id="${langId}"><![CDATA[${slugify(cleanName)}]]></language></link_rewrite>
    <description><language id="${langId}"><![CDATA[${cleanName}]]></language></description>
  </category>
</prestashop>`;

  const result = await safeApiCall(
    () => prestashopApi.post("/categories", xml, { responseType: "text" }),
    `Création catégorie "${cleanName}"`,
    log
  );

  if (!result) {
    // Si la création échoue (ex: déjà existant), on tente une dernière recherche
    const retry = await findIdByFilter("categories", "name", cleanName);
    if (retry) {
      importCache.categories.set(cleanName, retry);
      return retry;
    }
    return defaultCategoryId; // Fallback vers Home
  }

  const data = xmlToJs(result.data); // Parse la reponse
  const createdId = extractId(data, "categories") || defaultCategoryId;
  if (createdId) importCache.categories.set(cleanName, createdId);
  return createdId;
}

// ensureTax(rate, log) : cree la taxe si elle n existe pas
async function ensureTax(rate, log) {
  const cacheKey = String(rate);
  if (importCache.taxes.has(cacheKey)) return importCache.taxes.get(cacheKey);

  const existing = await findIdByFilter("taxes", "rate", rate); // Cherche si existe
  if (existing) {
    importCache.taxes.set(cacheKey, existing);
    return existing; // Retourne l ID existant
  }

  const label = `Taxe ${rate}%`; // Nom descriptif
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <tax>
    <name><language id="${langId}"><![CDATA[${label}]]></language></name>
    <rate>${rate}</rate>
    <active>1</active>
  </tax>
</prestashop>`;

  const result = await safeApiCall(
    () => prestashopApi.post("/taxes", xml, { responseType: "text" }),
    `Création taxe ${rate}%`,
    log
  );

  if (!result) return null; // Echec
  const data = xmlToJs(result.data); // Parse la reponse
  const createdId = extractId(data, "taxes");
  if (createdId) importCache.taxes.set(cacheKey, createdId);
  return createdId;
}

// getCountryIdByIso(iso) : trouve l ID du pays par code ISO
async function getCountryIdByIso(iso) {
  const cleanIso = String(iso || "").trim().toUpperCase();
  if (!cleanIso) return 0;
  if (importCache.countries.has(cleanIso)) return importCache.countries.get(cleanIso);

  const id = await findIdByFilter("countries", "iso_code", cleanIso); // Cherche par ISO
  const result = id || 0;
  if (result) importCache.countries.set(cleanIso, result);
  return result; // Retourne l ID ou 0
}

// ensureTaxRuleGroup(rate, countryIso, log) : cree le groupe de regles de taxe
async function ensureTaxRuleGroup(rate, countryIso, log) {
  const label = `TVA ${rate}%`; // Nom du groupe
  const cacheKey = `${String(rate)}|${String(countryIso || "").trim().toUpperCase()}`;

  if (importCache.taxRuleGroups.has(cacheKey)) {
    return importCache.taxRuleGroups.get(cacheKey);
  }

  // Cherche si le groupe existe deja
  let groupId = await findIdByFilter("tax_rule_groups", "name", label);

  if (!groupId) { // N existe pas → creer
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <tax_rule_group>
    <name><![CDATA[${label}]]></name>
    <active>1</active>
  </tax_rule_group>
</prestashop>`;

    const result = await safeApiCall(
      () => prestashopApi.post("/tax_rule_groups", xml, { responseType: "text" }),
      `Création groupe taxe "${label}"`,
      log
    );

    if (result) {
      const data = xmlToJs(result.data);
      groupId = extractId(data, "tax_rule_groups");
    }

    if (!groupId) {
      const retryId = await findIdByFilter("tax_rule_groups", "name", label);
      if (retryId) groupId = retryId;
    }
  }

  if (!groupId) return 0; // Pas de groupe = pas de taxe

  importCache.taxRuleGroups.set(cacheKey, groupId);

  // Cree la taxe et la regle associee
  const taxId = await ensureTax(rate, log);
  const countryId = await getCountryIdByIso(countryIso);

  if (taxId && countryId) {
    // Verifie si la regle existe deja
    const existingRuleId = await findIdByFilter("tax_rules", "id_tax_rules_group", groupId);

    if (!existingRuleId) { // N existe pas → creer
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <tax_rule>
    <id_tax_rules_group>${groupId}</id_tax_rules_group>
    <id_country>${countryId}</id_country>
    <id_state>0</id_state>
    <id_tax>${taxId}</id_tax>
    <state_behavior>0</state_behavior>
    <zipcode_from>0</zipcode_from>
    <zipcode_to>0</zipcode_to>
  </tax_rule>
</prestashop>`;

      await safeApiCall(
        () => prestashopApi.post("/tax_rules", xml, { responseType: "text" }),
        `Création règle taxe ${rate}%`,
        log
      );
    }
  }

  return groupId; // Retourne l ID du groupe
}

// findProductIdByReference(reference) : trouve un produit par reference
async function findProductIdByReference(reference) {
  return await findIdByFilter("products", "reference", reference);
}

// ensureAttributeGroup(name, log) : cree un groupe d attributs (ex: taille, couleur)
async function ensureAttributeGroup(name, log) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;

  if (importCache.attributeGroups.has(cleanName)) return importCache.attributeGroups.get(cleanName);

  const existing = await findIdByFilter("product_options", "name", cleanName);
  if (existing) {
    importCache.attributeGroups.set(cleanName, existing);
    return existing;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product_option>
    <group_type><![CDATA[select]]></group_type>
    <name><language id="${langId}"><![CDATA[${cleanName}]]></language></name>
    <public_name><language id="${langId}"><![CDATA[${cleanName}]]></language></public_name>
  </product_option>
</prestashop>`;

  const result = await safeApiCall(
    () => prestashopApi.post("/product_options", xml, { responseType: "text" }),
    `Création groupe attribut "${cleanName}"`,
    log
  );

  if (!result) return null;
  const data = xmlToJs(result.data);
  const createdId = extractId(data, "product_options");
  if (createdId) importCache.attributeGroups.set(cleanName, createdId);
  return createdId;
}

// ensureAttributeValue(groupId, name, log) : cree une valeur d attribut (ex: ngoza, kely)
async function ensureAttributeValue(groupId, name, log) {
  const cleanName = String(name || "").trim();
  if (!cleanName || !groupId) return null;

  const cacheKey = `${groupId}|${cleanName}`;
  if (importCache.attributeValues.has(cacheKey)) return importCache.attributeValues.get(cacheKey);

  // Recherche filtree par nom et groupe
  const params = new URLSearchParams({
    display: "[id]",
    "filter[name]": `[${cleanName}]`,
    "filter[id_attribute_group]": `[${groupId}]`,
    limit: "1"
  }).toString();
  
  try {
    const response = await prestashopApi.get(`/product_option_values?${params}`, { responseType: "text" });
    const data = xmlToJs(response.data);
    const items = normalizeList(data, "product_option_values");
    if (items[0]?.id) {
      const existingId = Number(items[0].id);
      importCache.attributeValues.set(cacheKey, existingId);
      return existingId;
    }
  } catch (e) { /* ignore */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product_option_value>
    <id_attribute_group>${groupId}</id_attribute_group>
    <name><language id="${langId}"><![CDATA[${cleanName}]]></language></name>
  </product_option_value>
</prestashop>`;

  const result = await safeApiCall(
    () => prestashopApi.post("/product_option_values", xml, { responseType: "text" }),
    `Création valeur attribut "${cleanName}"`,
    log
  );

  if (!result) return null;
  const data = xmlToJs(result.data);
  const createdId = extractId(data, "product_option_values");
  if (createdId) importCache.attributeValues.set(cacheKey, createdId);
  return createdId;
}

// createCombination(productId, attributeId, price, log, reference) : cree une declinaison
async function createCombination(productId, attributeId, price, log, reference = "") {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <combination>
    <id_product>${productId}</id_product>
    <reference><![CDATA[${reference}]]></reference>
    <price>${price.toFixed(6)}</price>
    <minimal_quantity>1</minimal_quantity>
    <associations>
      <product_option_values>
        <product_option_value><id>${attributeId}</id></product_option_value>
      </product_option_values>
    </associations>
  </combination>
</prestashop>`;

  const result = await safeApiCall(
    () => prestashopApi.post("/combinations", xml, { responseType: "text" }),
    `Création déclinaison "${reference}" pour produit #${productId}`,
    log
  );

  if (!result) return null;
  const data = xmlToJs(result.data);
  return extractId(data, "combinations");
}

// createProduct(row, categoryId, taxGroupId, log) : cree un produit
// row : objet avec les cles normalisees du CSV
function createProduct(row, categoryId, taxGroupId, log) {
  const name = row.nom; // Nom du produit
  const reference = row.reference; // Reference unique
  const priceTtc = parseNumber(row.prix_ttc); // Prix TTC
  const taxRate = parseNumber(row.taxe); // Taux de taxe
  // Calcul du prix HT : PrestaShop stocke le prix HT dans <price>
  // Si le taux est 11.65%, priceHt = priceTtc / 1.1165
  let priceHt = taxRate ? priceTtc / (1 + taxRate / 100) : priceTtc; 
  const wholesale = parseNumber(row.prix_achat); // Prix d achat
  // Appliquer la conversion vers la devise boutique si necessaire
  priceHt = priceHt * currencyMultiplier;
  const wholesaleConverted = wholesale * currencyMultiplier;
  const availableDate = toIsoDate(row.date_availability_produit); // Date disponibilite

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product>
    <id_category_default>${categoryId}</id_category_default>
    <id_tax_rules_group>${taxGroupId || 0}</id_tax_rules_group>
    <type>1</type>
    <id_shop_default>1</id_shop_default>
    <reference><![CDATA[${reference}]]></reference>
    <price>${priceHt.toFixed(6)}</price>
    <wholesale_price>${wholesaleConverted.toFixed(6)}</wholesale_price>
    <active>1</active>
    <state>1</state>
    <available_for_order>1</available_for_order>
    <minimal_quantity>1</minimal_quantity>
    <show_price>1</show_price>
    <available_date>${availableDate}</available_date>
    <name><language id="${langId}"><![CDATA[${name}]]></language></name>
    <link_rewrite><language id="${langId}"><![CDATA[${slugify(name)}]]></language></link_rewrite>
    <description><language id="${langId}"><![CDATA[${name}]]></language></description>
    <description_short><language id="${langId}"><![CDATA[${name}]]></language></description_short>
    <associations>
      <categories>
        <category><id>${categoryId}</id></category>
      </categories>
    </associations>
  </product>
</prestashop>`;

  return safeApiCall(
    () => prestashopApi.post("/products", xml, { responseType: "text" }),
    `Création produit "${name}" (${reference})`,
    log
  );
}

// updateStockQuantity(productId, quantity, log, attributeId) : met a jour le stock
async function updateStockQuantity(productId, quantity, log, attributeId = 0, historyMeta = {}) {
  // Cherche l ID du stock_available pour ce produit et cette declinaison
  let stockId = null;
  let currentQty = null;
  try {
    const params = new URLSearchParams({
      display: "full",
      "filter[id_product]": `[${productId}]`,
      "filter[id_product_attribute]": `[${attributeId}]`,
      limit: "1"
    }).toString();
    const response = await prestashopApi.get(`/stock_availables?${params}`, { responseType: "text" });
    const data = xmlToJs(response.data);
    const items = normalizeList(data, "stock_availables");
    stockId = items[0]?.id ? Number(items[0].id) : null;
    currentQty = items[0]?.quantity !== undefined ? Number(items[0].quantity) : null;
  } catch (e) {
    log.push(`Stock introuvable pour produit #${productId} (attr #${attributeId})`);
    return false;
  }

  if (!stockId) return false; // Pas de stock

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <stock_available>
    <id>${stockId}</id>
    <id_product>${productId}</id_product>
    <id_product_attribute>${attributeId}</id_product_attribute>
    <id_shop>1</id_shop>
    <id_shop_group>0</id_shop_group>
    <quantity>${quantity}</quantity>
    <depends_on_stock>0</depends_on_stock>
    <out_of_stock>2</out_of_stock>
  </stock_available>
</prestashop>`;

  const result = await safeApiCall(
    () => prestashopApi.put(`/stock_availables/${stockId}`, xml, { responseType: "text" }),
    `MAJ stock produit #${productId} (attr #${attributeId}) → ${quantity}`,
    log
  );

  if (result) {
    appendStockHistory({
      productId,
      productName: historyMeta.productName || `Produit #${productId}`,
      reference: historyMeta.reference || "",
      attributeId,
      previousQty: currentQty,
      newQty: quantity,
      delta: currentQty === null ? null : quantity - currentQty,
      source: historyMeta.source || "import",
      note: historyMeta.note || "Import stock"
    });
  }

  return !!result;
}

// uploadImagesFromZip(zipFile, referenceToId, log) : extrait les images du ZIP et les envoie
async function uploadImagesFromZip(zipFile, referenceToId, log) {
  if (!zipFile) return; // Pas de ZIP
  let zip;
  try {
    zip = await JSZip.loadAsync(zipFile); // Dezippe en memoire
  } catch (e) {
    log.push(`Erreur ouverture ZIP: ${e.message}`);
    return;
  }

  const files = Object.values(zip.files); // Liste des fichiers du ZIP

  for (const entry of files) { // Parcourt chaque fichier
    if (entry.dir) continue; // Ignore les dossiers
    if (entry.name.startsWith("__MACOSX")) continue; // Ignore les fichiers Mac

    const fileName = entry.name.split("/").pop(); // Nom du fichier sans chemin
    const ref = fileName.split(".")[0]; // Reference = nom sans extension
    
    // Cherche l ID dans le cache local, sinon interroge l API
    let productId = referenceToId[ref];
    if (!productId) {
      productId = await findProductIdByReference(ref);
    }

    if (!productId) {
      log.push(`⚠️ Image ignorée: ${fileName} (produit non trouvé pour réf "${ref}")`);
      continue;
    }

    try {
      const blob = await entry.async("blob"); // Convertit en Blob
      const formData = new FormData(); // Cree le formulaire
      formData.append("image", blob, fileName); // Ajoute l image

      await fetch(`${baseURL}/images/products/${productId}`, { // Upload via fetch
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}` }, // Auth Basic
        body: formData
      });

      log.push(`Image importée: ${fileName} → produit #${productId}`);
    } catch (e) {
      log.push(`Erreur image ${fileName}: ${e.message}`);
    }
  }
}

// importProductsAndImages({products, stock, zipFile, countryIso}) : fonction principale
// Cree categories, taxes, produits, met a jour le stock, et importe les images
export async function importProductsAndImages({ products, stock, zipFile, countryIso = "FR" }) {
  const log = []; // Journal d import
  const referenceToId = {}; // Map reference → ID produit
  const productBaseData = {}; // Map reference → { id, priceTtc, taxRate }

  // On repart toujours d'un etat propre pour chaque import
  importCache.categories.clear();
  importCache.taxes.clear();
  importCache.taxRuleGroups.clear();
  importCache.attributeGroups.clear();
  importCache.attributeValues.clear();
  importCache.countries.clear();

  // Forcer l'utilisation de l'Euro pour les imports : pas de conversion
  currencyMultiplier = 1;
  log.push('ℹ️ Devise forcée pour l\'import : EUR (conversion désactivée)');

  // --- ETAPE 1 : Creer les produits ---
  for (const row of products) { // Parcourt chaque ligne produit
    const categoryName = row.categorie || "Home"; // Nom categorie
    const categoryId = await ensureCategory(categoryName, log); // Assure la categorie
    const taxRate = parseNumber(row.taxe); // Taux taxe
    const taxGroupId = taxRate ? await ensureTaxRuleGroup(taxRate, countryIso, log) : 0; // Groupe taxe

    // Verifie si le produit existe deja par sa reference
    const existingId = await findProductIdByReference(row.reference);

    let productId = existingId;
    if (!existingId) { // N existe pas → creer
      const result = await createProduct(row, categoryId, taxGroupId, log);
      if (result) {
        const data = xmlToJs(result.data);
        productId = extractId(data, "products");
      }
    }

    if (productId) {
      referenceToId[row.reference] = productId; // Associe reference → ID
      productBaseData[row.reference] = {
        id: productId,
        priceTtc: parseNumber(row.prix_ttc),
        taxRate: taxRate
      };
      log.push(`✅ Produit OK: ${row.nom} (${row.reference}) → #${productId}`);
    } else {
      log.push(`❌ Produit KO: ${row.nom} (${row.reference}) - Impossible de récupérer l'ID`);
    }
  }

  // --- ETAPE 2 : Traiter le stock et les déclinaisons ---
  for (const row of stock) { // Parcourt chaque ligne de stock
    const ref = row.reference; // Reference du produit
    if (!ref) continue;

    const baseData = productBaseData[ref];
    const productId = baseData?.id || (await findProductIdByReference(ref));
    if (!productId) {
      log.push(`⚠️ Stock ignoré (produit introuvable): ${ref}`);
      continue;
    }

    const spec = row.specificite || row.specificité; // Nom de l attribut (ex: taille)
    const kara = row.karazany; // Valeur de l attribut (ex: ngoza)
    const qty = parseNumber(row.stock_initial); // Quantite
    const variantPriceTtc = parseNumber(row.prix_vente_ttc); // Prix TTC de la variante
    
    // Gestion des declinaisons
    if (spec && kara) {
      const groupId = await ensureAttributeGroup(spec, log);
      const attrValueId = groupId ? await ensureAttributeValue(groupId, kara, log) : null;

      if (attrValueId) {
        let priceImpactHt = 0;
        
        // Si on a les données de base, on calcule l'impact sans refaire d'appel API
        if (baseData && variantPriceTtc > 0) {
          const impactTtc = variantPriceTtc - baseData.priceTtc;
          const taxMultiplier = 1 + (baseData.taxRate / 100);
          priceImpactHt = (impactTtc / taxMultiplier) * currencyMultiplier;
        }

        // Cree la declinaison (Combination)
        const combRef = `${ref}-${kara}`;
        const combId = await createCombination(productId, attrValueId, priceImpactHt, log, combRef);
        if (combId) {
          await updateStockQuantity(productId, qty, log, combId, {
            productName: row.nom,
            reference: ref,
            source: "import",
            note: `${spec}: ${kara}`
          });
          log.push(`📊 Déclinaison OK: ${ref} (${spec}: ${kara}) → Stock ${qty}${priceImpactHt !== 0 ? ' (Impact prix: ' + priceImpactHt.toFixed(2) + ')' : ''}`);
          continue;
        }
      }
    }

    // Si pas de declinaison (produit simple)
    const success = await updateStockQuantity(productId, qty, log, 0, {
      productName: row.nom,
      reference: ref,
      source: "import",
      note: "Stock principal"
    });
    if (success) log.push(`📊 Stock maj (principal): ${ref} = ${qty}`);
  }

  // --- ETAPE 3 : Importer les images ---
  await uploadImagesFromZip(zipFile, referenceToId, log); // Import images

  return { log }; // Retourne le journal
}
