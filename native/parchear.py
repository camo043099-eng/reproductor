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
open(m, "w").write(x)

# 3) Bibliotecas de Media3 (ExoPlayer)
g = "android/app/build.gradle"
t = open(g).read()
if "media3-exoplayer" not in t:
    libs = '    implementation "androidx.media3:media3-exoplayer:1.4.1"\n    implementation "androidx.media3:media3-session:1.4.1"\n    implementation "androidx.media3:media3-common:1.4.1"\n'
    t = t.replace("dependencies {\n", "dependencies {\n" + libs, 1)
assert "media3-exoplayer" in t
open(g, "w").write(t)
