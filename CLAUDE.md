# Glow para RosarioGarage — notas del proyecto

Extensión de Chrome (Manifest V3, sin build) que mejora rosariogarage.com (clasificados de Rosario): favoritos, avisos vistos, ordenar el listado y barra de contacto en cada aviso. **No oficial.** Versión en `manifest.json` (la maneja el workflow de release, no la toques a mano).

## Estructura
- `manifest.json` — permisos: `storage` y host `https://dolarapi.com/*` (única conexión de red). `minimum_chrome_version: 120` (el CSS usa anidamiento).
- `background.js` — service worker: trae el dólar oficial (`venta`) de `dolarapi.com/v1/dolares/oficial`, lo cachea 6 h en `rgRate` y responde al mensaje `rg-rate`. Con él `content.js` ordena mezclando pesos y U$S y muestra la conversión entre paréntesis (pesos ÷ oficial, U$S × oficial). Sin cotización, los U$S se ordenan al final.
- `early.js` (document_start) — lee `rgOff` de `chrome.storage.sync` y lo publica en `html[data-rg-off]`.
- `content.css` — cada mejora está gateada por `html[data-rg-off~="<mejora>"]` para que el popup aplique en vivo.
- `content.js` — corazones en las tarjetas, barra de orden, panel de favoritos y barra de contacto (Shadow DOM), observador de mutaciones.
- `popup.html` / `popup.js` — interruptores por mejora (`favs`, `seen`, `sort`, `conv`, `contact`, `ads`).
- `tools/` — `e2e.mjs` (prueba contra el sitio en vivo con Edge), `make-icons.mjs`, `next-version.mjs`, `cws-publish.mjs`.
- `.github/workflows/release.yml` + `RELEASING.md` — publicación automática (ver ahí).

## Sitio
PHP clásico, sin framework. Listado: `.box-list > [data-rel=<id>]` (clases `box_aviso_premium` y `box_aviso_no_premium`), título en `.box_aviso_tit a` / `.box_aviso_premium_tit a`, precio en `.precio`, imagen real en `img[data-src]`. Ficha: `/index.php?action=carro/showProduct&itmId=<id>&rbrId=<rubro>`, título en `h1`, precio en `.box-text`, WhatsApp en `a.btn-contact-whatsapp`. Banners: `.banner_sop`. Las clases pueden cambiar: ante un fallo, correr `e2e.mjs` primero.

## Almacenamiento
Sincronizado: `rgFav:<id>` (una clave por favorito, tope 150) y `rgOff` (mejoras apagadas). Local: `rgSeen` (id → fecha, tope 3000), `rgPrefs` (orden y ocultar vistos) y `rgRate` (cotización cacheada). El precio original de cada elemento se guarda en `data-rg-price` antes de agregar la conversión, para no leer texto propio.

## Cómo probar
`node tools/e2e.mjs <carpetaExtension> <carpetaSalida>` — Edge sin pantalla con la extensión real sobre el sitio en vivo (Node 22+). Chrome 137+ de marca ya no acepta `--load-extension`.

## Pendiente (manual, una sola vez)
1. Subir a mano el primer zip a la Chrome Web Store y completar la ficha (`store/LISTING.md`); pegar la política https://matiaspignani.github.io/glow-para-rosariogarage/ (desde `docs/index.html`, copia de `store/privacy.html`; mantenerlas iguales).
2. Cargar los secretos `CWS_SERVICE_ACCOUNT_JSON`, `CWS_PUBLISHER_ID` y `CWS_EXTENSION_ID` en el repo (los dos primeros son los mismos que en Promiedos) y volver a correr el workflow Release. Detalles en `RELEASING.md`.

## Convenciones
- Artefactos (código, comentarios, commits) en inglés; textos de interfaz en español rioplatense neutro.
- Commits convencionales (definen la versión: `feat` menor, `fix` parche). Sin "Co-Authored-By" ni atribución de IA.
- Sin publicidad inyectada en el sitio ajeno (política de la Chrome Web Store).
