// Glow para RosarioGarage: favorites, seen listings, page sorting and a contact bar.
// Plain DOM, no build. Listing cards are `[data-rel]` inside `.box-list`; the detail page is
// /index.php?action=carro/showProduct&itmId=<id>&rbrId=<id>.
(() => {
  "use strict";
  if (window.__rgGlow) return;
  window.__rgGlow = true;

  const ORIGIN = "https://www.rosariogarage.com";
  const FAV_PREFIX = "rgFav:";
  const FAV_MAX = 150; // chrome.storage.sync allows 512 items and 100 KB in total
  const SEEN_MAX = 3000;

  const params = new URLSearchParams(location.search);
  const DETAIL_ID = params.get("action") === "carro/showProduct" && /^\d+$/.test(params.get("itmId") || "") ? params.get("itmId") : null;

  const root = document.documentElement;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const isId = (v) => /^\d+$/.test(String(v));

  // Listings are `[data-rel]` cards. In the main listing they are direct children of `.box-list`;
  // on an agency page (/<agency>/) each one is wrapped in a `.grid-item`. The "unit" is the
  // direct child of `.box-list` that holds the card: that is what gets sorted and hidden.
  const unitOf = (card) => {
    let u = card;
    while (u.parentElement && !u.parentElement.classList.contains("box-list")) u = u.parentElement;
    return u.parentElement ? u : card;
  };
  const cardOf = (unit) => (unit.hasAttribute("data-rel") ? unit : unit.querySelector("[data-rel]"));

  let favs = {}; // id -> { t: title, p: price, i: image path, r: rubro id, at: timestamp }
  let seen = {}; // id -> timestamp
  let prefs = { sort: "orig", hideSeen: false };

  // ---------- storage ----------
  const store = {
    loadAll(done) {
      try {
        chrome.storage.sync.get(null, (all) => {
          favs = {};
          for (const [k, v] of Object.entries(all || {})) {
            if (k.startsWith(FAV_PREFIX) && isId(k.slice(FAV_PREFIX.length)) && v && typeof v.t === "string") favs[k.slice(FAV_PREFIX.length)] = v;
          }
          chrome.storage.local.get(["rgSeen", "rgPrefs"], (l) => {
            seen = (l && l.rgSeen) || {};
            prefs = { ...prefs, ...((l && l.rgPrefs) || {}) };
            done();
          });
        });
      } catch {
        done();
      }
    },
    setFav(id, data) {
      try { chrome.storage.sync.set({ [FAV_PREFIX + id]: data }); } catch { /* ignore */ }
    },
    removeFav(id) {
      try { chrome.storage.sync.remove(FAV_PREFIX + id); } catch { /* ignore */ }
    },
    saveSeen() {
      try { chrome.storage.local.set({ rgSeen: seen }); } catch { /* ignore */ }
    },
    savePrefs() {
      try { chrome.storage.local.set({ rgPrefs: prefs }); } catch { /* ignore */ }
    },
  };

  // ---------- reading the page ----------
  function readCard(card) {
    const id = card.getAttribute("data-rel");
    const link = card.querySelector('a[href*="showProduct"]');
    const title = card.querySelector(".box_aviso_tit a, .box_aviso_premium_tit a") || link;
    const img = card.querySelector("img[data-src], img");
    const src = (img && (img.getAttribute("data-src") || img.src)) || "";
    return {
      id,
      data: {
        t: clean(title && title.textContent),
        p: clean((card.querySelector(".precio") || {}).textContent),
        i: src.startsWith(ORIGIN) ? src.slice(ORIGIN.length) : "",
        r: link ? new URL(link.href, ORIGIN).searchParams.get("rbrId") || "" : "",
      },
    };
  }

  function readDetail() {
    const price = [...document.querySelectorAll(".box-text")].find((e) => /^(U\$S|\$)\s*[\d.]+/.test(clean(e.textContent)));
    const photo = document.querySelector('img[src*="uploads_files"]');
    const src = (photo && photo.src) || "";
    return {
      id: DETAIL_ID,
      data: {
        t: clean((document.querySelector("h1") || {}).textContent) || clean(document.title),
        p: price ? clean(price.textContent) : "",
        i: src.startsWith(ORIGIN) ? src.slice(ORIGIN.length) : "",
        r: params.get("rbrId") || "",
      },
    };
  }

  const itemUrl = (id, r) => `${ORIGIN}/index.php?action=carro/showProduct&itmId=${encodeURIComponent(id)}&rbrId=${encodeURIComponent(r || "")}`;

  // ---------- favorites ----------
  function toggleFav({ id, data }) {
    if (!isId(id)) return;
    if (favs[id]) {
      delete favs[id];
      store.removeFav(id);
    } else {
      if (Object.keys(favs).length >= FAV_MAX) {
        alert(`Llegaste al máximo de ${FAV_MAX} favoritos. Quitá alguno para guardar otro.`);
        return;
      }
      favs[id] = { ...data, at: Date.now() };
      store.setFav(id, favs[id]);
    }
    refresh();
  }

  function addHeart(card) {
    card.classList.add("rg-card");
    const id = card.getAttribute("data-rel");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rg-heart";
    btn.dataset.id = id;
    btn.textContent = "♥";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFav(readCard(card));
    });
    card.append(btn);
  }

  // ---------- seen ----------
  function markSeen(id) {
    if (!isId(id) || seen[id]) return;
    seen[id] = Date.now();
    const ids = Object.keys(seen);
    if (ids.length > SEEN_MAX) {
      ids.sort((a, b) => seen[a] - seen[b]).slice(0, ids.length - SEEN_MAX).forEach((k) => delete seen[k]);
    }
    store.saveSeen();
    refresh();
  }

  function onOpen(e) {
    const a = e.target.closest && e.target.closest('a[href*="showProduct"]');
    if (!a) return;
    const card = a.closest("[data-rel]");
    markSeen(card ? card.getAttribute("data-rel") : new URL(a.href, ORIGIN).searchParams.get("itmId"));
  }

  // ---------- sorting ----------
  const MODES = {
    orig: ["Orden original"],
    priceAsc: ["Precio: menor a mayor"],
    priceDesc: ["Precio: mayor a menor"],
    yearDesc: ["Año: más nuevo primero"],
    kmAsc: ["Kilometraje: menor primero"],
  };

  function numbers(card) {
    const tit = clean((card.querySelector(".box_aviso_tit, .box_aviso_premium_tit") || {}).textContent);
    const price = clean((card.querySelector(".precio") || {}).textContent);
    const year = tit.match(/\b(19|20)\d{2}\b/);
    const km = tit.match(/([\d.]+)\s*km/i);
    const amount = price.replace(/[^\d]/g, "");
    return {
      // USD listings sort after every peso listing: the two are not comparable without a rate.
      price: amount ? (/U\$S|USD/i.test(price) ? 1e12 : 0) + Number(amount) : null,
      year: year ? Number(year[0]) : null,
      km: km ? Number(km[1].replace(/\./g, "")) : null,
    };
  }

  function applySort() {
    const mode = MODES[prefs.sort] ? prefs.sort : "orig";
    for (const box of document.querySelectorAll(".box-list")) {
      // Units without a card (e.g. the agency's contact panel) keep their place at the top.
      const cols = [...box.children].filter((c) => cardOf(c));
      cols.forEach((c, i) => { if (!c.dataset.rgI) c.dataset.rgI = String(i); });
      const key = (c) => {
        const n = numbers(cardOf(c));
        return mode === "priceAsc" || mode === "priceDesc" ? n.price : mode === "yearDesc" ? n.year : mode === "kmAsc" ? n.km : Number(c.dataset.rgI);
      };
      const dir = mode === "priceDesc" || mode === "yearDesc" ? -1 : 1;
      const sorted = [...cols].sort((a, b) => {
        const ka = key(a), kb = key(b);
        if (ka == null && kb == null) return Number(a.dataset.rgI) - Number(b.dataset.rgI);
        if (ka == null) return 1;
        if (kb == null) return -1;
        return (ka - kb) * dir || Number(a.dataset.rgI) - Number(b.dataset.rgI);
      });
      if (sorted.some((c, i) => c !== cols[i])) sorted.forEach((c) => box.append(c));
    }
  }

  function ensureBar() {
    if (document.querySelector(".rg-bar")) return;
    const anchor = document.querySelector("#item_results") || document.querySelector(".box-list");
    if (!anchor || !anchor.parentNode) return;
    const bar = document.createElement("div");
    bar.className = "rg-bar";

    const sortLabel = document.createElement("label");
    sortLabel.dataset.rgSort = "";
    sortLabel.append("Ordenar esta página: ");
    const select = document.createElement("select");
    for (const [value, [text]] of Object.entries(MODES)) select.append(new Option(text, value));
    select.value = prefs.sort;
    select.addEventListener("change", () => {
      prefs.sort = select.value;
      store.savePrefs();
      applySort();
    });
    sortLabel.append(select);

    const seenLabel = document.createElement("label");
    seenLabel.dataset.rgSeen = "";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = prefs.hideSeen;
    box.addEventListener("change", () => {
      prefs.hideSeen = box.checked;
      store.savePrefs();
      refresh();
    });
    seenLabel.append(box, "Ocultar avisos vistos");

    bar.append(sortLabel, seenLabel);
    anchor.parentNode.insertBefore(bar, anchor);
  }

  // ---------- floating UI (Shadow DOM: the site's CSS cannot reach it) ----------
  const SHADOW_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    .fab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; display: flex; align-items: center; gap: 6px;
      padding: 10px 14px; border: 0; border-radius: 999px; background: #ff8a1f; color: #1b1b1b; font-weight: 700; font-size: 14px;
      cursor: pointer; box-shadow: 0 4px 14px rgb(0 0 0 / .4); }
    :host(.has-bar) .fab { bottom: 76px; }
    .panel { position: fixed; right: 16px; bottom: 70px; z-index: 2147483000; width: min(360px, calc(100vw - 32px)); max-height: 70vh;
      display: none; flex-direction: column; border-radius: 10px; background: #1b1b1b; color: #f2f2f2; box-shadow: 0 8px 28px rgb(0 0 0 / .55); }
    :host(.has-bar) .panel { bottom: 130px; }
    .panel.open { display: flex; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #333; font-weight: 700; }
    header button, .row button { border: 0; background: none; color: #a8a8a8; cursor: pointer; font-size: 13px; }
    header button:hover, .row button:hover { color: #fff; }
    ul { margin: 0; padding: 4px 0; overflow: auto; list-style: none; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; }
    .row img { width: 64px; height: 46px; flex: none; border-radius: 4px; background: #333; object-fit: cover; }
    .row a { flex: 1; min-width: 0; color: inherit; text-decoration: none; font-size: 13px; line-height: 1.3; }
    .row a:hover b { text-decoration: underline; }
    .row b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row span { color: #ff8a1f; font-weight: 700; }
    .empty { padding: 18px 14px; color: #a8a8a8; font-size: 13px; }
    .bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147482990; display: none; align-items: center; gap: 12px;
      padding: 10px 16px; background: #1b1b1b; color: #f2f2f2; border-top: 2px solid #ff8a1f; }
    .bar.show { display: flex; }
    .bar .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
    .bar .p { font-size: 18px; font-weight: 800; color: #ff8a1f; white-space: nowrap; }
    .bar a, .bar button { padding: 9px 14px; border: 0; border-radius: 6px; font-weight: 700; font-size: 14px; text-decoration: none; cursor: pointer; }
    .bar a { background: #25d366; color: #0b2b14; }
    .bar button { background: #333; color: #fff; }
    .bar button.on { background: #ff8a1f; color: #1b1b1b; }
    :host-context(html[data-rg-off~="favs"]) .fab, :host-context(html[data-rg-off~="favs"]) .panel,
    :host-context(html[data-rg-off~="contact"]) .bar { display: none !important; }
  `;

  let ui = null;

  function buildUi() {
    const host = document.createElement("div");
    host.id = "rg-host";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;

    const fab = document.createElement("button");
    fab.className = "fab";
    fab.type = "button";
    const panel = document.createElement("div");
    panel.className = "panel";
    const header = document.createElement("header");
    const heading = document.createElement("span");
    heading.textContent = "Mis favoritos";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copiar lista";
    header.append(heading, copy);
    const list = document.createElement("ul");
    panel.append(header, list);
    fab.addEventListener("click", () => panel.classList.toggle("open"));
    copy.addEventListener("click", async () => {
      const text = Object.entries(favs).map(([id, f]) => `${f.t} - ${f.p}\n${itemUrl(id, f.r)}`).join("\n\n");
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "¡Copiado!";
      } catch {
        copy.textContent = "No se pudo copiar";
      }
      setTimeout(() => (copy.textContent = "Copiar lista"), 1500);
    });

    const bar = document.createElement("div");
    bar.className = "bar";
    shadow.append(style, fab, panel, bar);
    document.documentElement.append(host);
    ui = { host, fab, panel, list, bar, barHeart: null };
  }

  function renderFavList() {
    ui.list.textContent = "";
    const entries = Object.entries(favs).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    ui.fab.textContent = `♥ ${entries.length}`;
    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Todavía no guardaste avisos. Tocá el ♥ de cualquier aviso.";
      ui.list.append(empty);
      return;
    }
    for (const [id, f] of entries) {
      const li = document.createElement("li");
      li.className = "row";
      if (typeof f.i === "string" && f.i.startsWith("/")) {
        const img = document.createElement("img");
        img.src = ORIGIN + f.i;
        img.alt = "";
        li.append(img);
      }
      const a = document.createElement("a");
      a.href = itemUrl(id, f.r);
      a.target = "_blank";
      a.rel = "noopener";
      const t = document.createElement("b");
      t.textContent = f.t;
      const p = document.createElement("span");
      p.textContent = f.p;
      a.append(t, p);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "Quitar";
      rm.addEventListener("click", () => toggleFav({ id, data: f }));
      li.append(a, rm);
      ui.list.append(li);
    }
  }

  function buildContactBar() {
    const wa = document.querySelector("a.btn-contact-whatsapp");
    const { id, data } = readDetail();
    if (!wa && !data.p) return;
    ui.host.classList.add("has-bar");

    const t = document.createElement("div");
    t.className = "t";
    t.textContent = data.t;
    const p = document.createElement("div");
    p.className = "p";
    p.textContent = data.p;
    ui.bar.append(t, p);
    if (wa && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(wa.href)) {
      const link = document.createElement("a");
      link.href = wa.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "WhatsApp";
      ui.bar.append(link);
    }
    const heart = document.createElement("button");
    heart.type = "button";
    heart.textContent = "♥";
    heart.setAttribute("aria-label", "Guardar en favoritos");
    heart.addEventListener("click", () => toggleFav(readDetail()));
    ui.bar.append(heart);
    ui.barHeart = heart;
    ui.bar.classList.add("show");

    // The page's own contact button is enough while it is on screen.
    if (wa && "IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => ui.bar.classList.toggle("show", !entry.isIntersecting)).observe(wa);
    }
  }

  // ---------- refresh / scan ----------
  function refresh() {
    root.classList.toggle("rg-hide-seen", prefs.hideSeen);
    for (const btn of document.querySelectorAll(".rg-heart")) btn.classList.toggle("rg-on", Boolean(favs[btn.dataset.id]));
    for (const card of document.querySelectorAll("[data-rel].rg-card")) unitOf(card).classList.toggle("rg-seen", Boolean(seen[card.getAttribute("data-rel")]));
    if (ui) {
      renderFavList();
      if (ui.barHeart) ui.barHeart.classList.toggle("on", Boolean(DETAIL_ID && favs[DETAIL_ID]));
    }
  }

  function scan() {
    for (const card of document.querySelectorAll(".box-list [data-rel]:not(.rg-card)")) {
      if (isId(card.getAttribute("data-rel"))) addHeart(card);
    }
    ensureBar();
    applySort();
    refresh();
  }

  function init() {
    buildUi();
    if (DETAIL_ID) {
      buildContactBar();
      markSeen(DETAIL_ID);
    }
    scan();
    document.addEventListener("click", onOpen, true);
    document.addEventListener("auxclick", onOpen, true);

    let timer = 0;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, 300);
    }).observe(document.body, { childList: true, subtree: true });

    // Keep favorites in step with other tabs and devices.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      let touched = false;
      for (const [k, c] of Object.entries(changes)) {
        if (!k.startsWith(FAV_PREFIX)) continue;
        const id = k.slice(FAV_PREFIX.length);
        if (c.newValue) favs[id] = c.newValue;
        else delete favs[id];
        touched = true;
      }
      if (touched) refresh();
    });
  }

  store.loadAll(init);
})();
