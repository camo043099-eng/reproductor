# Rediseño de la interfaz de Onda

Documento de trabajo para Claude Code. Léelo completo antes de empezar y cíñete al alcance.

## 1. Objetivo y alcance

Renovar **toda la interfaz** de Onda (`app/`: HTML, CSS y JS) con un estilo nuevo, conservando todas las funciones actuales.

**Fuera de alcance, sin permiso expreso de Carlos:**
- El motor de audio y todo `native/` (Java, ecualizador, Oboe, parches).
- El puente entre interfaz y motor (`nativo.js`) y su contrato de eventos y métodos. La interfaz nueva debe llamarlo exactamente igual.
- La firma del APK, los secretos y el flujo de GitHub Actions.
- Widgets de pantalla de inicio (son nativos): quedan para después.

Carlos no programa. Explica todo en español claro, sin jerga, y muestra capturas antes de dar algo por hecho.

## 2. Dirección de diseño

Referencias (solo inspiración; **no copies gráficos, iconos ni imágenes**, algunos vienen de bancos de imágenes con licencia):
- Estructura: inicio tipo "Discover" (buscador arriba, pestañas, carrusel de carátulas, lista de recomendados), **mini reproductor fijo abajo** y reproductor completo con **carátula circular rodeada de un anillo de progreso**.
- Estilo: oscuro gris azulado, tarjetas con esquinas muy redondeadas, relieves suaves, acentos en degradado.
- Ideas anotadas para más adelante (no ahora): barra de progreso en forma de onda, progreso en arco, widgets de cristal.

Decisiones tomadas:
- **Progreso del reproductor: anillo** alrededor de la carátula circular. Ligero y sin analizar el audio.
- **Acento en degradado que toma el color de la carátula** que suena. Sin carátula: degradado de respaldo violeta a azul.
- **Tipografía: Montserrat**, empaquetada en `app/fonts/` (la app funciona sin internet).
- Se conserva el **tema claro** y el tamaño de interfaz por pellizco.
- Iconos propios, en SVG, coherentes entre sí.

## 3. Pantallas a rediseñar

Primero **haz un inventario** de todas las pantallas, hojas y funciones actuales (revisa `index.html` y `main.js`) y confírmalo con Carlos. Como mínimo:

1. **Inicio:** buscador, pestañas, carrusel, mixes y listas automáticas (este mes, sin escuchar, sin carátula, posibles duplicadas).
2. **Mini reproductor** fijo, con pausa y apertura del reproductor completo.
3. **Reproductor completo:** carátula, anillo de progreso, título, artista, tiempos, anterior, play o pausa, siguiente, aleatorio, repetir, favorito, compartir, cola, letras, temporizador de sueño, chip Hi-Res.
4. **Biblioteca:** Canciones, Álbumes, Artistas, Carpetas, con orden y filtros.
5. **Búsqueda:** resultados limitados a 50 con el texto "Mostrando 50 de N".
6. **Listas** (incluye importar y exportar M3U, editar etiquetas con deshacer, limpiar duplicadas).
7. **Letras** sincronizadas, con ajuste de retraso Bluetooth.
8. **Ecualizador** (10 y 31 bandas) y ajustes de audio.
9. **Ajustes** por categorías con buscador, y **Acerca de** con el Registro de errores.

## 4. Sistema de diseño

Define variables CSS en un solo archivo (`app/css/tokens.css` o equivalente):
- Colores: fondo gris azulado oscuro (aprox. `#1c2129`), superficie (`#2a303a`), texto (`#f2f4f7`), texto suave (`#9aa3af`), acento dinámico.
- Radios: 12, 20 y 28 px; carátula circular o con esquinas muy redondeadas.
- Espaciado base de 4 px; tamaños de toque de al menos 44 px.
- Sombras suaves y poco costosas. Sin desenfoques pesados en listas.
- Animaciones solo con `transform` y `opacity`.

## 4b. Rendimiento (obligatorio)

El teléfono de Carlos se pegaba con la búsqueda. Reglas fijas:
- Listas largas por tandas o virtualizadas. Nunca pintar miles de filas de una vez.
- Búsqueda con espera de 200 ms y máximo 50 resultados en la vista Buscar. En Biblioteca > Canciones, dibujar por tandas sin bloquear.
- No decodificar audio para dibujar nada.
- Mide antes y después con `tests/bench_ui.py`: 2751 y 10 000 canciones, CPU frenada 4×. Ninguna interacción debe bloquear más de 100 ms en tareas largas.

## 5. Arquitectura de la interfaz

- Divide `main.js` (unas 2300 líneas) en **módulos por pantalla**, importables en Node, con un estado central pequeño.
- Mantén `player.js` (web) y `nativo.js` (Android) con los mismos métodos y eventos.
- Actualiza la lista `SHELL` del service worker cada vez que añadas o renombres archivos, y sube la versión en `package.json`, `app/sw.js`, `VERSION` de `main.js` y el README.
- Actualiza `CLAUDE.md` con la nueva estructura al terminar cada fase.

## 6. Pruebas

- Las **45 pruebas de Node** y las **26 del ecualizador en Java** deben seguir pasando en todo momento. Si alguna falla, algo se tocó que no debía.
- Cada módulo nuevo lleva pruebas de Node.
- Cada pantalla lleva una prueba de Playwright con captura en móvil y escritorio. Si falta Chromium de Playwright, instálalo y avisa.
- Añade pruebas de regresión para: no sonar solo al abrir, búsqueda sin congelarse, Hi-Res en caliente.

## 7. Fases

Trabajo en la rama **`rediseno`**. `main` sigue produciendo el Onda actual.

- **Fase 0:** inventario de pantallas, plan de archivos y qué se reutiliza. Solo el plan, sin código.
- **Fase 1:** tokens, tipografía, estructura de navegación y barra inferior.
- **Fase 2:** reproductor completo y mini reproductor.
- **Fase 3:** inicio.
- **Fase 4:** biblioteca y búsqueda.
- **Fase 5:** listas, letras y ecualizador.
- **Fase 6:** ajustes, Acerca de y registro de errores.
- **Fase 7:** pulido, tema claro, accesibilidad, rendimiento.
- **Fase 8:** merge a `main`, solo con la aprobación de Carlos.

Al cerrar cada fase: pruebas en verde, capturas, APK de prueba compilado y resumen corto de qué cambió. No avances a la siguiente fase sin el visto bueno de Carlos.

## 8. Reglas de trabajo

- Cambios mínimos y coherentes con el estilo del proyecto. Nada fuera de alcance.
- No subas a `main` ni toques la firma, los secretos o `native/` sin permiso.
- Ahorra cuota: lee solo los archivos necesarios y compacta cuando convenga.
- Si algo te obliga a tocar el motor, **detente y pregunta**.
