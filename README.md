# Onda

Reproductor de música propio: FLAC/MP3/M4A/OGG/WAV, ecualizador de 10 bandas, ReplayGain, temporizador de sueño, listas, favoritas, cola, funciona sin internet (PWA) y se empaqueta como APK con Capacitor.

- Web/PWA: carpeta `app/` (sin dependencias).
- Pruebas: `node --test tests/*.test.mjs` y `python3 tests/e2e_test.py` (Playwright).
- APK: GitHub Actions (`APK`) → artefacto `Onda-apk` (instalar con "origen desconocido").
