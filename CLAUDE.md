# Glow para RosarioGarage — notas del proyecto

Extensión de Chrome (Manifest V3, sin build) que mejora rosariogarage.com (clasificados de Rosario): favoritos, avisos vistos, ordenar el listado y barra de contacto en cada aviso. **No oficial.** Versión en `manifest.json` (la maneja el workflow de release, no la toques a mano).

## Estructura
- `manifest.json` — permiso mínimo: `storage`. Sin permisos de host, sin red propia. `minimum_chrome_version: 120` (el CSS usa anidamiento).
- `early.js` (document_start) — lee `rgOff` de `chrome.storage.sync` y lo publica en `html[data-rg-off]`.
- `content.css` — cada mejora está gateada por `html[data-rg-off~="<mejora>"]` para que el popup aplique en vivo.
- `content.js` — corazones en las tarjetas, barra de orden, panel de favoritos y barra de contacto (Shadow DOM), observador de mutaciones.
- `popup.html` / `popup.js` — interruptores por mejora (`favs`, `seen`, `sort`, `contact`, `ads`).
- `tools/` — `e2e.mjs` (prueba contra el sitio en vivo con Edge), `make-icons.mjs`, `next-version.mjs`, `cws-publish.mjs`.
- `.github/workflows/release.yml` + `RELEASING.md` — publicación automática (ver ahí).

## Sitio
PHP clásico, sin framework. Listado: `.box-list > [data-rel=<id>]` (clases `box_aviso_premium` y `box_aviso_no_premium`), título en `.box_aviso_tit a` / `.box_aviso_premium_tit a`, precio en `.precio`, imagen real en `img[data-src]`. Ficha: `/index.php?action=carro/showProduct&itmId=<id>&rbrId=<rubro>`, título en `h1`, precio en `.box-text`, WhatsApp en `a.btn-contact-whatsapp`. Banners: `.banner_sop`. Las clases pueden cambiar: ante un fallo, correr `e2e.mjs` primero.

## Almacenamiento
Sincronizado: `rgFav:<id>` (una clave por favorito, tope 150) y `rgOff` (mejoras apagadas). Local: `rgSeen` (id → fecha, tope 3000) y `rgPrefs` (orden y ocultar vistos).

## Cómo probar
`node tools/e2e.mjs <carpetaExtension> <carpetaSalida>` — Edge sin pantalla con la extensión real sobre el sitio en vivo (Node 22+). Chrome 137+ de marca ya no acepta `--load-extension`.

## Convenciones
- Artefactos (código, comentarios, commits) en inglés; textos de interfaz en español rioplatense neutro.
- Commits convencionales (definen la versión: `feat` menor, `fix` parche). Sin "Co-Authored-By" ni atribución de IA.
- Sin publicidad inyectada en el sitio ajeno (política de la Chrome Web Store).
