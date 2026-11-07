# Rediseño — Fase 0: inventario y plan de archivos

Solo plan, sin código. Rama `rediseno` (creada desde `develop`, 0.9.116). Falta tu aprobación para pasar a la Fase 1.

## 1. Inventario de lo que existe hoy

Medido en el código actual: `index.html` 440 líneas, `styles.css` 1066, `main.js` 2339 (más 9 módulos auxiliares que no se tocan).

### Pantallas principales (barra inferior: Inicio · Buscar · Biblioteca · Ajustes; el orden es personalizable)
| Pantalla | Qué tiene hoy |
|---|---|
| **Inicio** | Accesos rápidos, mixes del día, listas automáticas (este mes, sin escuchar, sin carátula, calidad baja, posibles duplicadas), «Tu actividad» (estadísticas), «Sorpresa», «Personalizar» inicio, «Continuar álbum» |
| **Buscar** | Buscador con espera de 200 ms, máximo 50 resultados y «Mostrando 50 de N» |
| **Biblioteca** | Raíz con categorías; pestañas Canciones, Álbumes, Artistas, Carpetas (solo si hay), Listas; orden (título/artista/álbum/recientes); buscador propio de Canciones; índice A‑Z lateral con burbuja; botones Reproducir / Aleatorio / Seleccionar; detalle de álbum, artista, carpeta y lista |
| **Selección múltiple** | Pulsación larga, Todo, Rango, y acciones: reproducir, lista, cola, siguiente, info, eliminar (borra archivos con confirmación del sistema) |
| **Mini reproductor** | Carátula, título, artista, pausa, siguiente, barra fina de progreso; abre el reproductor |
| **Reproductor completo** | Carátula grande (con efecto «al ritmo» y visualizador opcionales), título/artista/álbum, chips de calidad/Hi‑Res, barra de posición con burbuja, saltos ±10 s, aleatorio/anterior/play/siguiente/repetir, favorita, gestos (mitad izquierda = avanzar/retroceder con vista previa), «Buscar carátula en internet» |

### Hojas (ventanas que suben desde abajo)
Cola (con arrastre para reordenar) · Letra (sincronizada, traducir, desfase Bluetooth ±0,5 s, buscar otra, pegar) · Ecualizador (gráfico 10/31 bandas, paramétrico, presets, import AutoEQ/Equalizador APO, espacial) · Temporizador de sueño · Opciones de canción (compartir, lista, siguiente, ir a álbum/artista, editar etiquetas con deshacer, detalles, ruta de audio, eliminar…) · Editar etiquetas · Detalles · Ruta de audio · Información de audio · Elegir carátula (internet o galería) · Estadísticas · Menú genérico · Diálogo propio · Registro de errores · **Ajustes** (7 categorías con buscador interno: Audio, Efectos, Apariencia, Carátulas, Biblioteca, Datos, Acerca de).

### Funciones transversales que el documento no menciona
Temas «mornye» y «nocturno», tema claro/oscuro, modos **coche**, plano, compacta, sin desenfoque, sin animaciones, sin etiquetas, sin chips · fondo propio del usuario y «ambiente» de color · pantalla de intro · tamaño de interfaz por pellizco · iconos de temporada · gestos de fila (deslizar para favorita / «a continuación») · copia de seguridad y restaurar · importar/exportar M3U · limpiar duplicadas · salida de audio (DAC/Bluetooth) · guardar y retomar pistas largas.

## 2. Qué se reutiliza y qué se reescribe

**No se toca (fuera de alcance o ya independiente):** `native/` completo, `nativo.js`, `player.js` (mismos métodos y eventos), `tags.js`, `db.js`, `internet.js`, `eqpro.js`, `recomendador.js`, `gestos.js`, `registro.js`, `.github/`, firma.

**Se reutiliza tal cual (lógica, solo se mueve de sitio):** `pintar` por tandas, normalización y búsqueda, `vistasCache`, `extraerColor`/`aplicarColores` (color de la carátula → acento), mixes, duplicadas, M3U, copia de seguridad, letras, cola, ecualizador (lógica de `armarEq`/`dibujarCurva`), temporizador, sesión/historial.

**Se reescribe:** el HTML de `index.html`, todo `styles.css` (se sustituye por varios archivos) y las funciones de `main.js` que *generan* HTML (`dibujarInicio`, `dibujarRaiz`, `filaCancion`, `actualizarMini`, hoja del reproductor…).

## 3. Plan de archivos

```
app/
  index.html                  (estructura nueva; mismos ids de las pruebas donde se pueda)
  css/
    tokens.css                colores, radios 12/20/28, espaciado 4 px, sombras, animaciones
    base.css                  reinicio, tipografía, botones, chips, interruptores
    navegacion.css            cabecera, barra inferior, mini reproductor
    reproductor.css           reproductor completo, anillo, cola, letra
    inicio.css
    biblioteca.css            listas, filas, índice A‑Z, selección, búsqueda
    hojas.css                 ecualizador, ajustes, diálogos, menús
    temas.css                 claro, nocturno/mornye, coche y demás modos
  fonts/Montserrat*.woff2     (hoy hay Inter y Google Sans Flex)
  icons/ui/*.svg              iconos propios (un conjunto coherente)
  js/
    main.js                   solo arranque y enlace (de ~2300 a unos pocos cientos de líneas)
    ui/estado.js              estado central pequeño (E, porId, MOTOR, reproductor)
    ui/util.js                $, esc, fmt, normal (importable en Node)
    ui/hojas.js               abrir/cerrar/pila, diálogo, menú, avisos
    ui/pintar.js              listas por tandas / perezosas
    ui/portadas.js            portadas, color dinámico, fondo
    ui/navegacion.js, mini.js, reproductor.js, cola.js
    ui/inicio.js, biblioteca.js, busqueda.js, seleccion.js
    ui/listas.js, letras.js, ecualizador.js, ajustes.js
```
`sw.js`: la lista `SHELL` se actualiza en cada fase con los archivos nuevos, y se sube la versión (`package.json`, `sw.js`, `VERSION`, README). `CLAUDE.md` se actualiza al cerrar cada fase.

### Cómo se parte `main.js` sin romper la app
No de golpe. En cada fase se extrae **solo la pantalla de esa fase** a su módulo y `main.js` sigue funcionando entre fase y fase. Las funciones comparten estado (`E`, `listaActual`, `pila`…); por eso `estado.js` va primero (Fase 1). Las pruebas e2e usan `window.__onda`, que se conserva.

## 4. Orden de fases (según el documento)
1 tokens, tipografía, navegación y barra inferior · 2 reproductor y mini · 3 inicio · 4 biblioteca y búsqueda · 5 listas, letras y ecualizador · 6 ajustes, Acerca de y registro · 7 pulido, tema claro, accesibilidad, rendimiento · 8 merge a `main` (solo con tu aprobación).

## 5. Pruebas y rendimiento
- Hoy hay **52 pruebas de Node** (el documento dice 45) y la prueba del ecualizador en Java (el documento dice 26; no la he ejecutado en esta fase). Deben seguir pasando.
- Pruebas de regresión que ya existen: no sonar solo al abrir (`nativo.test.mjs`), búsqueda sin congelarse (`e2e_busqueda_biblioteca.py`), CSS de filas (`css.test.mjs`). **Falta** una de Hi‑Res en caliente: se añade.
- `tests/bench_ui.py` existe (50 líneas); hay que comprobar que admite 10 000 canciones y CPU 4× antes de usarlo como medida.
- Cada pantalla nueva lleva captura Playwright en móvil y escritorio.

## 6. Cosas que necesito que decidas
1. **Fuente Montserrat:** no está en el repo. Hay que descargarla (licencia libre OFL) o me das el archivo. ¿La descargo?
2. **APK de prueba por fase:** el flujo de GitHub solo compila al subir a `main` o manualmente. Un APK de prueba tendría la misma firma y el mismo `appId`, así que **reemplazaría tu Onda actual** en el teléfono (con tus datos, pero con la interfaz a medio hacer). Tener las dos apps a la vez exigiría cambiar el `appId` en el script de compilación (`native/` / flujo), que el documento prohíbe sin permiso. ¿Prefieres (a) que reemplace tu Onda, o (b) que te pida permiso para instalar las dos lado a lado?
3. **Funciones extra** (temas, modo coche, ambiente, intro, visualizador, carátula al ritmo, gestos): ¿se mantienen todas con el estilo nuevo, o quieres quitar alguna?
4. **Fila de accesos del reproductor** (ecualizador, temporizador, letra, agregar a lista): hoy está oculta y se llega por «Más opciones». ¿La nueva interfaz la muestra o se queda en el menú? «Compartir» hoy está en el menú de la canción, no en el reproductor.
5. **Git:** la rama `rediseno` está creada solo en local. Los archivos `docs/rediseno-interfaz.md`, este plan y `actualizar-onda.ps1` están sin commit. ¿Los incluyo en la rama?
