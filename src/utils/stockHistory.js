const STORAGE_KEY = "newapp-stock-history";

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

export function loadStockHistory() {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStockHistory(entries) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
}

export function appendStockHistory(entry) {
  if (!canUseStorage() || !entry?.productId) return;

  const history = loadStockHistory();
  history.push({
    id: `${entry.productId}-${entry.attributeId || 0}-${Date.now()}`,
    productId: String(entry.productId),
    productName: entry.productName || "Produit",
    reference: entry.reference || "",
    attributeId: Number(entry.attributeId || 0),
    previousQty: Number.isFinite(Number(entry.previousQty)) ? Number(entry.previousQty) : null,
    newQty: Number.isFinite(Number(entry.newQty)) ? Number(entry.newQty) : null,
    delta: Number.isFinite(Number(entry.delta)) ? Number(entry.delta) : null,
    source: entry.source || "update",
    note: entry.note || "",
    date: entry.date || new Date().toISOString()
  });
  saveStockHistory(history);
}

export function clearStockHistory() {
  if (!canUseStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getProductStockHistory(productId, attributeId = 0) {
  const pid = String(productId);
  const attrId = Number(attributeId || 0);
  return loadStockHistory()
    .filter(entry => String(entry.productId) === pid && Number(entry.attributeId || 0) === attrId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
