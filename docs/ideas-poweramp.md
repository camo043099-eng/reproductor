# Ideas tomadas de Poweramp (solo ideas y organizacion, no codigo ni diseno copiado)
Fuente: capturas de ajustes que envio Carlos (tanda 1 de varias). Estado: SOLO GUARDADO, sin implementar.

## Estructura de Ajustes (pantalla principal con buscador)
Apariencia · Audio · Visualizacion · Fondo · Caratulas · Biblioteca · Auriculares/Bluetooth · Pantalla de bloqueo · Miscelaneo · Acerca de.
Otros: Exportar/Importar ajustes y datos, Obtener soporte, Enviar errores. Cada categoria muestra un resumen de lo que contiene.
- Idea Onda: buscador dentro de Ajustes; subpantallas por categoria; exportar/importar ajustes.

## Apariencia
- Tema (por defecto/claro/oscuro/dia-noche del sistema), fuente (por defecto/alternativa/negrita/negrita+).
- Interfaz del reproductor, Letra, Notificaciones (subpantallas), opciones de lista (nombre de archivo como titulo, numero de pista).
- Idioma, icono configurable, orientacion (auto/vertical/horizontal).
- Animaciones: deshabilitado / rapido / por defecto  (encaja con la preferencia de Carlos: sin movimiento constante).
- Iniciar en biblioteca, ocultar barra de estado, mantener pantalla encendida, accesos directos a ajustes.

## Audio
- Informacion de audio (detalle del procesamiento; pulsacion larga en metadatos o ecualizador).
- Crossfade, tipo de fundido y longitud, reproduccion continua (gapless).
- ReplayGain: activar, fuente, preamplificacion.
- Foco de audio: pausar/reanudar/atenuar en llamadas, notificaciones, inicio.
- Ecualizador: numero de bandas y frecuencias configurables.
- Remuestreador: remuestreo y dithering.
- Control de Volumen Directo (DVC), tambien para Bluetooth.
- Salida: AudioTrack, alta resolucion (Hi-Res), OpenSL.
- Personalizacion avanzada: niveles de volumen, MusicFX, restablecer preajustes de EQ/reverb.

## Visualizacion
- Visualizacion en pantalla principal (boton), espectro en el ecualizador (deshabilitado/clasico/redondeado).
- Duracion de preajuste (cambiar cada Ns), transparencia del panel y de controles difuminados, tiempo de espera de la interfaz.
- Caratula visible durante visualizacion, ignorar primer toque, opacidad de la pista.
- Ocultar barras del sistema, barras ajustadas a la caratula, HD, recorte, forzar 30 FPS, modo estricto.
- Idea Onda: ya tenemos ondas; agregar control de FPS (30/60) y calidad (HD) como opciones de rendimiento.

---
# Tanda 2 (Biblioteca, Auriculares/Bluetooth, Foco de audio) — SOLO GUARDADO

## Biblioteca
- Volver a escanear (muestra contadores: carpetas, listas, canciones) y "Volver a escanear todo" (borra la base de etiquetas; para cambio de SD/ROM/carpetas movidas).
- Conserva valoraciones y listas de almacenamientos eliminados tras un reescaneo normal. Escanea solo en uso activo (ahorra bateria) y por fragmentos en bibliotecas grandes.
- Carpetas de musica (aviso: Android no deja anadir Descargas/raiz; usar subcarpetas). Modo heredado de acceso a archivos (permiso extra).
- Ignorar pistas cortas (menos de N segundos), ignorar pistas de video (MP4/3GP).
- Avanzado: guardar/restaurar progreso por pista (podcasts/largas), botones -10/+10 s para pistas largas, umbral de duracion (ej. 45 min), "contar como reproducido" al X % (ej. 50 %) -> util para estadisticas.
- Subpantallas: Listas/Categorias, Buscar (opciones de reproduccion de resultados), Cola, Listas de reproduccion (importar/exportar), Aleatorio, Escaner.

## Auriculares / Bluetooth
- Conexion: pausar al desconectar (auriculares, DAC USB, Bluetooth), reanudar al conectar cableados, reanudar con Bluetooth.
- Botones: responder a botones; cableados/Bluetooth: un toque rapido, doble/triple toque = anterior/siguiente, mantener = avanzar.
- Opciones de pulsacion larga de teclas de volumen.
- "Reanudar/Pausar/Detener estrictamente" (para equipos de auto con comandos raros), ignorar comandos Bluetooth N segundos tras conectar (0-20), ignorar repetir/aleatorio por Bluetooth.
- Feedback: sonido, pitido adicional, vibracion; ultimos comandos procesados (depuracion); restaurar predeterminados.

## Foco de audio
- Reanudar tras llamada, al iniciar, al reabrir; esperar almacenamiento (hasta 30 s).
- Interrupciones cortas (notificaciones/navegacion): pausar o atenuar; pausar en llamada; reanudar al recuperar el foco; cambio permanente de foco (otro reproductor/juego) pausa.
- Aviso Android 8+: el sistema puede cerrar la app en pausa -> mantener notificacion.
- Chromecast puede ignorar focos cortos.

## Que ya tiene Onda (para no repetir)
Pausa al desconectar audifonos y salida por dispositivo existen; falta revisar foco de audio (atenuar vs pausar), botones multi-toque, ignorar pistas cortas/video, umbral "contar como reproducido", progreso en pistas largas, reescaneo total.
