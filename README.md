# Onda

Reproductor de música personal para Android, pensado para escuchar la biblioteca propia con la mejor calidad posible: audio Hi-Res, ecualizador avanzado y control total de la biblioteca, sin depender de internet ni de servicios de streaming.

La interfaz es una aplicación web (carpeta `app/`, sin dependencias) que también funciona como PWA sin conexión, y se empaqueta como APK de Android con Capacitor. El sonido pasa por un motor nativo propio en Java (carpeta `native/`).

## Funciones

- **Formatos:** FLAC, MP3, M4A, OGG y WAV, incluidos FLAC Hi-Res de 24 bits.
- **Hi-Res puro:** modo en el que los FLAC de 24 bits salen tal cual, sin procesar.
- **Ecualizador** de 10 o 31 bandas y modo avanzado con filtros paramétricos; importa perfiles de AutoEQ y Equalizer APO.
- **ReplayGain** para nivelar el volumen entre canciones.
- **Información de audio:** pantalla con los datos del archivo y del códec, ayuda con los códecs Bluetooth (SBC, AAC, aptX, LDAC) y análisis de DAC USB.
- **Letras sincronizadas,** con el retraso de Bluetooth recordado para cada aparato.
- **Carátulas:** búsqueda en internet para elegir la portada, y visualización con efecto CD, ondas o espectro.
- **Listas de reproducción, favoritas y cola;** importar y exportar listas M3U.
- **Posibles duplicadas:** lista automática de canciones repetidas, con limpieza que preselecciona la copia de menor calidad de cada grupo.
- **Fundido entre canciones** de hasta 12 segundos.
- **Temporizador de sueño.**
- **Agitar el teléfono** para pasar de canción, con sensibilidad ajustable.
- **Ajustes por categorías con buscador,** con opciones como ocultar audios cortos, carpetas a ocultar, y exportar e importar ajustes y datos.

## Estructura del proyecto

- `app/` — la interfaz web y PWA: reproductor, ecualizador, letras, carátulas y ajustes.
- `native/java/` — el motor de audio nativo y los plugins de Android (ecualizador, carpetas, widget y servicio de reproducción).
- `native/prototipo_oboe/` — prototipo del motor en C++ con Oboe.
- `native/icono/` y `tools/` — generación de los iconos de la app, incluidos los de temporada.
- `docs/` — notas e ideas de diseño (por ejemplo, `ideas-poweramp.md`).
- `tests/` — las pruebas automáticas.

## Pruebas

```bash
node --test tests/*.test.mjs
python3 tests/e2e_test.py   # pruebas de la interfaz con Playwright
```

En GitHub Actions también corren la prueba de los iconos de temporada (`tests/manifiesto_iconos.test.py`) y la del ecualizador en Java (`tests/java/PruebaEq.java`).

## Compilar el APK

La forma habitual es GitHub Actions:

1. En GitHub, entra a **Actions** y elige el flujo **APK** (se lanza a mano con *Run workflow*; también corre solo con cambios en la rama `main`).
2. El flujo corre las pruebas, empaqueta la app con Capacitor y compila el APK de depuración con Gradle.
3. Descarga el artefacto **Onda-apk** e instálalo en el teléfono permitiendo la instalación desde orígenes desconocidos.

### Firma del APK

El flujo firma el APK siempre con la misma clave, para que las actualizaciones se instalen encima de la versión anterior. La clave **no está en el repositorio**: vive en los secretos de GitHub (*Settings → Secrets and variables → Actions*), con estos cuatro nombres:

- `ANDROID_KEYSTORE_BASE64`: el archivo `.jks` codificado en base64.
- `ANDROID_KEYSTORE_PASSWORD`: la contraseña del almacén.
- `ANDROID_KEY_ALIAS`: el alias de la clave.
- `ANDROID_KEY_PASSWORD`: la contraseña de la clave.

Crear la clave una sola vez (y guardar una copia fuera del repo, por ejemplo en un gestor de contraseñas; si se pierde, ya no se podrá actualizar la app instalada):

```bash
keytool -genkeypair -v -keystore onda.jks -alias onda -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 onda.jks   # el resultado va en ANDROID_KEYSTORE_BASE64
```

Si falta algún secreto, el flujo falla en el paso de firma en lugar de publicar un APK con otra clave.

También se puede compilar en una computadora, siguiendo los mismos pasos del flujo (Node 20 y JDK 17):

```bash
npm install
npx cap add android
cp native/java/*.java android/app/src/main/java/com/camo/onda/
python3 native/parchear.py
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Estado

Proyecto personal en desarrollo activo. La versión actual en la rama `develop` es la **0.10.1**.
