# Cómo se publica

La publicación en la Chrome Web Store es **100% automática**: no hay que subir versiones, tags ni zips a mano.

## Flujo normal

1. Trabajá con commits convencionales y hacé push a `main`.
2. El workflow `.github/workflows/release.yml` corre solo cuando el push toca archivos de la extensión y decide la versión con `tools/next-version.mjs`:

   | Commit | Resultado |
   |---|---|
   | `feat: ...` | sube la versión menor (0.1.0 → 0.2.0) |
   | `fix:` / `perf:` / `refactor:` / `revert:` | sube el parche (0.1.0 → 0.1.1) |
   | `feat!:` o `BREAKING CHANGE:` | menor mientras sea 0.x, mayor desde 1.0 |
   | `chore:` / `docs:` / `test:` / `ci:` / `style:` | no publica |

3. Si corresponde publicar: actualiza `manifest.json`, commitea `chore: release X.Y.Z`, crea el tag `vX.Y.Z`, arma el zip, lo sube a la tienda, lo envía a revisión y crea el GitHub Release con el zip adjunto.

La primera vez (sin ningún tag `v*`) se publica la versión que ya figura en `manifest.json` (0.1.0). La revisión de Google puede tardar horas o días.

## Probar sin publicar (dry run)

**Actions → Release → Run workflow** con `dry_run` en `true` (valor por defecto). Calcula la versión, arma y valida el zip y, si los tres secretos existen, comprueba las credenciales con una consulta de solo lectura. No sube nada, no commitea ni crea tags.

## Si falla la publicación

El commit de versión y el tag se suben **antes** de publicar para reservar el número. Si la tienda rechaza el zip, corregí el problema y corré **Run workflow** con `dry_run` en `false` y `republish` en `true`: vuelve a subir la versión que está en `manifest.json`.

## Configuración única (lo único que no se puede automatizar)

Estos pasos los tiene que hacer una persona una sola vez, porque dependen de cuentas de Google y GitHub:

1. **Crear la ficha en la Chrome Web Store.** La API no puede crear una extensión nueva: subí a mano el primer zip (`dist/glow-para-rosariogarage-0.1.0.zip`, generado con `zip -r -X` sobre los archivos de la extensión) desde el Developer Dashboard y completá la ficha (`store/LISTING.md`) y la pestaña Privacidad (`store/PRIVACY.md`). Después de esto, todo es automático.
2. **Cuenta de servicio.** Es la misma del proyecto de Promiedos, pero Google solo admite **una cuenta de servicio por publisher**: si ya está autorizada, se reutiliza sin hacer nada más (misma clave JSON y mismo `CWS_PUBLISHER_ID`).
3. **Secretos del repo** (Settings → Secrets and variables → Actions):

   | Secreto | Qué es |
   |---|---|
   | `CWS_SERVICE_ACCOUNT_JSON` | Clave JSON de la cuenta de servicio (contenido completo) |
   | `CWS_PUBLISHER_ID` | Developer Dashboard → Publisher → Settings |
   | `CWS_EXTENSION_ID` | ID de la extensión **nueva** (en la URL de su ficha) |

4. **Permisos del workflow.** No hace falta tocar nada: el workflow declara `contents: write` por sí mismo (igual que en Promiedos, con el ajuste del repo en *Read*). Si algún día `main` tiene protección de rama, el bot necesita poder pushear el commit de versión.
5. **Política de privacidad.** Se publica sola en https://matiaspignani.github.io/glow-para-rosariogarage/ (desde `docs/index.html`, copia de `store/privacy.html`; mantenerlas iguales). Pegar esa URL en la pestaña Privacidad de la tienda.

## Notas

- Solo el paso de publicación recibe los secretos, y `tools/cws-publish.mjs` nunca imprime tokens ni la clave.
- El push del commit `chore: release` lo hace `GITHUB_TOKEN`, por lo que no vuelve a disparar el workflow.
