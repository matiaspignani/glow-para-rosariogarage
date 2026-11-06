// Service worker: fetches the official USD rate (venta) so the content script can sort
// peso and dollar listings together. The rate is cached for 6 hours in chrome.storage.local.
const RATE_URL = "https://dolarapi.com/v1/dolares/oficial";
const TTL_MS = 6 * 60 * 60 * 1000;

async function getRate() {
  const { rgRate } = await chrome.storage.local.get("rgRate");
  if (rgRate && Date.now() - rgRate.at < TTL_MS) return rgRate;
  try {
    const res = await fetch(RATE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const venta = Number(data && data.venta);
    if (!Number.isFinite(venta) || venta < 100 || venta > 1e6) throw new Error("unexpected rate");
    const fresh = { venta, fecha: typeof data.fechaActualizacion === "string" ? data.fechaActualizacion.slice(0, 10) : "", at: Date.now() };
    await chrome.storage.local.set({ rgRate: fresh });
    return fresh;
  } catch {
    return rgRate || null; // a stale rate beats none; null makes dollar listings sort last
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "rg-rate" || sender.id !== chrome.runtime.id) return false;
  getRate().then(sendResponse, () => sendResponse(null));
  return true; // async response
});
