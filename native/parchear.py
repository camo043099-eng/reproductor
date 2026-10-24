import re
base = "android/app/src/main/"

# 1) MainActivity: registrar los plugins nativos
p = base + "java/com/camo/onda/MainActivity.java"
s = open(p).read()
nuevo = """public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle b) {
        registerPlugin(CarpetaPlugin.class);
        registerPlugin(MotorPlugin.class);
        super.onCreate(b);
        fondoOscuro();
    }
    // al volver de otra app el sistema puede mostrar un instante el fondo de la ventana: que sea negro y no blanco
    private void fondoOscuro() {
        try {
            getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.BLACK));
            getWindow().getDecorView().setBackgroundColor(android.graphics.Color.BLACK);
            if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(android.graphics.Color.BLACK);
        } catch (Throwable e) { /* no es crítico */ }
    }
    @Override
    public void onResume() {
        super.onResume();
        fondoOscuro();
    }
}"""
s = s.replace("public class MainActivity extends BridgeActivity {}", nuevo)
assert "MotorPlugin" in s, s
open(p, "w").write(s)

# 2) Manifiesto: permisos y servicio de reproducción
m = base + "AndroidManifest.xml"
x = open(m).read()
permisos = """    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
"""
servicio = """        <service android:name="com.camo.onda.MotorServicio" android:exported="true" android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaSessionService" />
            </intent-filter>
        </service>
"""
if "MotorServicio" not in x:
    x = x.replace("<application", permisos + "    <application", 1)
    x = x.replace("</application>", servicio + "    </application>", 1)
assert "MotorServicio" in x
# widget de pantalla de inicio (carátula, título y controles)
receptor = """        <receiver android:name="com.camo.onda.OndaWidget" android:exported="false" android:label="Onda">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_onda_info" />
        </receiver>
"""
if "OndaWidget" not in x:
    x = x.replace("</application>", receptor + "    </application>", 1)
assert "OndaWidget" in x
open(m, "w").write(x)

# 3) Bibliotecas de Media3 (ExoPlayer)
g = "android/app/build.gradle"
t = open(g).read()
if "media3-exoplayer" not in t:
    libs = '    implementation "androidx.media3:media3-exoplayer:1.4.1"\n    implementation "androidx.media3:media3-session:1.4.1"\n    implementation "androidx.media3:media3-common:1.4.1"\n'
    t = t.replace("dependencies {\n", "dependencies {\n" + libs, 1)
assert "media3-exoplayer" in t
# la app de prueba no debe ser "depurable": en ese modo el procesador de audio corre más lento y se oyen cortes al empezar
if "debuggable false" not in t:
    assert "buildTypes {" in t, "no encuentro buildTypes"
    t = t.replace("buildTypes {\n", "buildTypes {\n        debug {\n            debuggable false\n        }\n", 1)
open(g, "w").write(t)

# 4) Icono de Onda: PNG de todas las densidades + icono adaptativo (con versión monocromática para Android 13+)
import shutil, os
res = base + "res"
shutil.copytree("native/icono/res", res, dirs_exist_ok=True)
adaptativo = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_onda_fondo"/>
    <foreground android:drawable="@mipmap/ic_onda_frente"/>
    <monochrome android:drawable="@mipmap/ic_onda_mono"/>
</adaptive-icon>
"""
os.makedirs(res + "/mipmap-anydpi-v26", exist_ok=True)
for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
    open(res + "/mipmap-anydpi-v26/" + n, "w").write(adaptativo)
# el fondo de la ventana de arranque (Android 12+) en el mismo color del icono
print("icono de Onda instalado")

# 4a) Recursos del widget (diseño, fondo e iconos de los botones)
shutil.copytree("native/widget/res", res, dirs_exist_ok=True)
print("widget instalado")

# 4b) Iconos de temporada: la actividad de inicio pasa a ser un alias por icono (solo uno activo; lo cambia MotorPlugin.icono)
import sys
sys.path.insert(0, "native/icono")
import manifiesto as mf
for t in mf.TEMPORADAS:
    open(res + "/mipmap-anydpi-v26/ic_onda_%s.xml" % t, "w").write(mf.xml_adaptativo(t))
mx = open(m).read()
if "Icono_normal" not in mx:
    mx = mf.quitar_lanzador_de_principal(mx)
    mx = mf.agregar_alias(mx)
assert "Icono_normal" in mx
open(m, "w").write(mx)
print("iconos de temporada instalados")


# 5) Fondo de ventana negro (evita el destello blanco al volver a la app desde otra)
est = base + "res/values/styles.xml"
if os.path.exists(est):
    q = open(est).read()
    if "windowBackground" not in q:
        q = re.sub(r'(<style name="AppTheme\.NoActionBar"[^>]*>)', r'\1\n        <item name="android:windowBackground">#000000</item>', q, count=1)
    assert "windowBackground" in q, q
    open(est, "w").write(q)
