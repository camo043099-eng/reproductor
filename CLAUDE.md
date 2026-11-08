# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Onda: reproductor de música personal para Android (README en español; el código y los comentarios también). La UI es una web/PWA sin dependencias ni paso de build (`app/`, módulos ES cargados directamente), empaquetada con Capacitor 6 (`appId` `com.camo.onda`, `webDir: app`). El audio nativo lo hace un motor propio en Java.

## Comandos

```bash
npm test                                   # = node --test tests/*.test.mjs
node --test tests/eqpro.test.mjs           # un solo archivo de pruebas
node --test --test-name-pattern="cargar cola" tests/nativo.test.mjs   # una sola prueba
python3 tests/e2e_test.py                  # UI con Playwright (también e2e_extra.py, bench_ui.py)
python3 tests/manifiesto_iconos.test.py    # alias de iconos de temporada
# Prueba del ecualizador en Java (igual que en CI):
mkdir -p /tmp/jc && javac -d /tmp/jc native/java/Reverb.java native/java/NucleoEq.java tests/java/PruebaEq.java && java -cp /tmp/jc PruebaEq
```

No hay linter ni build de la web: se edita `app/` y se sirve tal cual. El APK se compila en GitHub Actions (`.github/workflows/apk.yml`, flujo manual o push a `main`; artefacto `Onda-apk`) o en local con Node 20 + JDK 17 (pasos en el README).

## Arquitectura

- **No existe carpeta `android/` en el repo**: el CI (y el build local) la genera con `npx cap add android`, copia `native/java/*.java` a `android/app/src/main/java/com/camo/onda/` y ejecuta `native/parchear.py`, que modifica `MainActivity.java` (registra `CarpetaPlugin` y `MotorPlugin`), el `AndroidManifest.xml` (permisos, servicio de reproducción, widget) y recursos. Cualquier clase Java nueva o cambio de manifiesto debe reflejarse en ese script (o en el paso de copia), no en una carpeta `android/`.
- **Doble motor de reproducción** en `app/js/`: `player.js` (reproducción en navegador/PWA) y `nativo.js` (`ReproductorNativo`, que recibe el plugin Capacitor `N` por inyección y delega en el motor Java). Las pruebas de `nativo.test.mjs` lo ejercitan con un `Proxy` falso del plugin, así que la API JS↔nativo se prueba sin Android.
- **Puente nativo** (`native/java/`): `MotorPlugin` (plugin Capacitor, API hacia JS), `Motor`/`MotorServicio` (reproducción y servicio en primer plano), `NucleoEq`/`EqProcesador`/`Reverb` (DSP del ecualizador; `NucleoEq` y `Reverb` se compilan solos para `tests/java/PruebaEq.java`, por eso no deben depender de Android), `CarpetaPlugin` (acceso a carpetas), `UsbSonda` (análisis de DAC USB), `OndaWidget`. `native/java/borradores/` contiene ideas no compiladas; `native/prototipo_oboe/` es un prototipo C++ aparte.
- **UI**: casi toda la lógica está en `app/js/main.js` (~2300 líneas) con `app/index.html` y `styles.css`. Módulos auxiliares: `eqpro.js` (ecualizador paramétrico, import AutoEQ/Equalizer APO), `tags.js` (lectura de etiquetas), `internet.js` (carátulas/letras en línea), `recomendador.js`, `gestos.js`, `db.js` (almacenamiento local).
- **Service worker** (`app/sw.js`): la caché lista a mano los archivos de `SHELL` y se invalida con la constante `V = "onda-vX.Y.Z"`. Al añadir/renombrar un módulo JS, fuente o icono hay que actualizarlo en `SHELL`, y subir `V` junto con `version` de `package.json` al publicar una versión (hoy 0.21.5) para que la PWA recargue.
- **Iconos**: `native/icono/importar_recursos.py` genera los iconos de Android y de la PWA a partir de `docs/recursos/iconos` (diseño entregado); `native/icono/temporadas.py` y `manifiesto.py` siguen con los alias de temporada; `tests/manifiesto_iconos.test.py` valida los alias.
- **Bienvenida** (primera apertura): `#bienvenida` en `index.html`, `css/bienvenida.css` y `js/bienvenida.js`; avisa con el evento `onda:bienvenida` (`empezar` pide el permiso de audio, `omitir` entra directo) y `main.js` (`mostrarBienvenida`) decide el resto. En navegador solo sale con `?bienvenida`; en Ajustes hay un botón para verla de nuevo.
- **Rediseño en curso (rama `rediseno`, plan en `docs/rediseno-interfaz.md` y `docs/rediseno-fase0.md`)**: la paleta, medidas y tipografía (Montserrat, `app/fonts/`) viven en `app/css/tokens.css` la cabecera/pestañas/barra inferior/mini reproductor en `app/css/navegacion.css` y el reproductor completo (carátula circular + anillo de progreso `#r-anillo`, que actualiza `pintarBarra`) en `app/css/reproductor.css` y el Inicio (buscador, carrusel, recomendados, listas inteligentes; el HTML lo genera `dibujarInicio`) en `app/css/inicio.css`, Biblioteca/Buscar (filas, categorías, rejillas, índice A‑Z, selección) en `app/css/biblioteca.css`, Ajustes (cabecera, tarjeta de la app, categorías en tarjetas, cada ajuste como tarjeta) en `app/css/ajustes.css`, hojas (cola, letras, ecualizador) en `app/css/hojas.css` y los esqueletos de carga en `app/css/esqueleto.css`; ambos se cargan *después* de `styles.css` y lo sobrescriben (`styles.css` se irá vaciando fase a fase). El acento es un degradado `--ac-1`→`--ac-2` que `aplicarColores` (main.js) calcula con el color de la carátula; no escribas colores de acento a mano (lo vigila `tests/css.test.mjs`). Cada CSS/fuente nuevo va en `SHELL` de `app/sw.js`.
- `docs/ideas-poweramp.md`: notas de diseño/ideas, no especificación.

## Pruebas

Los tests `.mjs` importan directamente los módulos de `app/js/` en Node (sin DOM salvo lo que simulen), usando archivos de `tests/fixtures/` (flac, mp3, m4a, ogg, wav). Mantén los módulos auxiliares importables en Node (sin acceso a `window`/`document` en el nivel superior).
