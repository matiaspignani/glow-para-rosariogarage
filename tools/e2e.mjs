// Drives a real (headless) Edge with the unpacked extension loaded, against the live site.
//   node tools/e2e.mjs <extensionDir> <outDir>
// Needs Node 22+ (global WebSocket). Chrome 137+ branded builds ignore --load-extension, hence Edge.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [EXT, OUT] = process.argv.slice(2);
const EDGE = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const BASE = "https://www.rosariogarage.com";
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "rg-edge-"));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
  "--no-first-run", "--disable-gpu", "--window-size=1280,800", "about:blank",
], { stdio: "ignore" });

let ws, nextId = 1;
const pending = new Map();
const events = [];
const errors = [];

const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const go = async (url, settle = 3500) => {
  events.length = 0;
  await send("Page.navigate", { url });
  for (let i = 0; i < 60 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await sleep(250);
  await sleep(settle);
};
const shot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
};

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

async function main() {
  let version;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); }
  }
  if (!version) throw new Error("browser did not start");
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      return m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    events.push(m);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // Listing
  await go(`${BASE}/Autos`);
  const hearts = await ev(`document.querySelectorAll('.rg-heart').length`);
  check("hearts on listing cards", hearts > 20, `(${hearts})`);
  check("sort bar present", await ev(`!!document.querySelector('.rg-bar select')`));
  check("banners hidden", await ev(`[...document.querySelectorAll('.banner_sop')].every(e => getComputedStyle(e).display === 'none')`));

  await ev(`document.querySelector('.rg-heart').click()`);
  await sleep(500);
  const on = await ev(`document.querySelectorAll('.rg-heart.rg-on').length`);
  check("heart toggles on", on === 1, `(${on})`);
  check("favorites counter", (await ev(`document.getElementById('rg-host').shadowRoot.querySelector('.fab').textContent`)).includes("1"));

  await ev(`(() => { const s = document.querySelector('.rg-bar select'); s.value = 'yearDesc'; s.dispatchEvent(new Event('change')); })()`);
  const years = await ev(`[...document.querySelectorAll('#item_results > [data-rel]')].map(c => (c.querySelector('.box_aviso_tit')?.textContent.match(/\\b(19|20)\\d{2}\\b/) || [])[0]).filter(Boolean).map(Number)`);
  check("sort by year, newest first", years.length > 10 && years.every((y, i) => i === 0 || years[i - 1] >= y), `(${years.slice(0, 5)})`);
  await ev(`document.getElementById('rg-host').shadowRoot.querySelector('.fab').click()`);
  await sleep(300);
  await shot("listing");

  // Agency page: cards are wrapped in .grid-item inside a CSS grid
  await go(`${BASE}/citroenajpc/`);
  const agencyHearts = await ev(`document.querySelectorAll('.rg-heart').length`);
  check("hearts on agency page", agencyHearts > 10, `(${agencyHearts})`);
  check("sort bar on agency page", await ev(`!!document.querySelector('.rg-bar select')`));
  await ev(`(() => { const s = document.querySelector('.rg-bar select'); s.value = 'priceAsc'; s.dispatchEvent(new Event('change')); })()`);
  const rateInfo = await ev(`document.querySelector('.rg-bar').dataset.rate || ''`);
  check("official dollar rate loaded", Number(rateInfo) > 100, `(${rateInfo})`);
  // Dollar prices are compared after conversion at the official rate.
  const agencyPrices = await ev(`(() => { const rate = Number(document.querySelector('.rg-bar').dataset.rate); return [...document.querySelector('.box-list').children].filter(u => u.querySelector('[data-rel]')).map(u => u.querySelector('.precio')?.dataset.rgPrice || '').filter(t => /\\d/.test(t)).map(t => Number(t.replace(/[^\\d]/g, '')) * (/U\\$S/.test(t) ? rate : 1)); })()`);
  check("agency sorted by price (USD converted)", agencyPrices.length > 10 && agencyPrices.every((p, i) => i === 0 || agencyPrices[i - 1] <= p), `(${agencyPrices.slice(0, 4)})`);
  check("dollar listings are interleaved", await ev(`(() => { const t = [...document.querySelector('.box-list').children].filter(u => u.querySelector('[data-rel]')).map(u => u.querySelector('.precio')?.dataset.rgPrice || ''); const last = t.map((x, i) => (/\\$/.test(x) && !/U\\$S/.test(x) ? i : -1)).reduce((a, b) => Math.max(a, b), -1); return t.some((x, i) => /U\\$S/.test(x) && i < last); })()`));
  const conv = await ev(`(() => { const rate = Number(document.querySelector('.rg-bar').dataset.rate); const num = (s) => Number(s.replace(/[^\\d]/g, '')); const rows = [...document.querySelectorAll('.box-list [data-rel] .precio')].map(el => ({ raw: el.dataset.rgPrice, conv: el.querySelector('.rg-conv')?.textContent || '' })); const peso = rows.find(r => /^\\$/.test(r.raw)); const usd = rows.find(r => /^U\\$S/.test(r.raw)); return { total: rows.length, withConv: rows.filter(r => r.conv).length, pesoOk: !!peso && peso.conv === '(U$S ' + Math.round(num(peso.raw) / rate).toLocaleString('es-AR') + ')', usdOk: !usd || usd.conv === '($ ' + Math.round(num(usd.raw) * rate).toLocaleString('es-AR') + ')', sample: [peso, usd] }; })()`);
  check("every price has its conversion", conv.total > 10 && conv.withConv === conv.total, `(${conv.withConv}/${conv.total})`);
  check("pesos -> USD divides by the official rate", conv.pesoOk, JSON.stringify(conv.sample[0]));
  check("USD -> pesos multiplies by the official rate", conv.usdOk, JSON.stringify(conv.sample[1]));
  check("contact panel stays first", await ev(`!document.querySelector('.box-list').firstElementChild.querySelector('[data-rel]')`));
  await ev(`document.querySelector('.rg-heart').click()`);
  await sleep(300);
  await shot("agency");

  // Detail
  await go(`${BASE}/index.php?action=carro/showProduct&itmId=5861031&rbrId=107`);
  const bar = await ev(`(() => { const b = document.getElementById('rg-host')?.shadowRoot.querySelector('.bar'); return b ? { shown: b.classList.contains('show'), text: b.textContent, wa: b.querySelector('a')?.href } : null; })()`);
  check("contact bar built", Boolean(bar && bar.text.includes("$")), JSON.stringify(bar && bar.text.slice(0, 60)));
  check("conversion in the contact bar", Boolean(bar && /\(U\$S [\d.]+\)/.test(bar.text)), JSON.stringify(bar && bar.text.slice(0, 80)));
  check("whatsapp link", Boolean(bar?.wa?.startsWith("https://wa.me/")));
  await shot("detail");

  check("no uncaught exceptions", errors.length === 0, errors.join(" | "));
}

main()
  .catch((e) => { console.error(e); results.push(false); })
  .finally(() => {
    proc.kill();
    process.exit(results.every(Boolean) ? 0 : 1);
  });
