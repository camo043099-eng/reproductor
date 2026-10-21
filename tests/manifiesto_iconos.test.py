import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "native", "icono"))
import manifiesto as m

base = '''<manifest>
    <application android:icon="@mipmap/ic_launcher">
        <activity android:configChanges="orientation" android:name=".MainActivity" android:launchMode="singleTask" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>'''

x = m.quitar_lanzador_de_principal(base)
assert "LAUNCHER" not in x and "MAIN" in x, "la principal sigue siendo lanzadora"
x = m.agregar_alias(x)
assert x.count("<activity-alias") == 4, "faltan alias"
assert x.count('android:enabled="true"') == 1 and 'Icono_normal" android:targetActivity=".MainActivity" android:enabled="true"' in x, "solo el normal debe quedar activo"
assert x.count("android.intent.category.LAUNCHER") == 4, "cada alias debe ser lanzador"
x2 = m.agregar_alias(x)
assert x2 == x, "no es idempotente"
assert 'android:icon="@mipmap/ic_onda_halloween"' in x and 'android:icon="@mipmap/ic_launcher"' in x
assert "<activity-alias" in x and x.rstrip().endswith("</manifest>")
print("ok: manifiesto con 4 alias, solo el normal activo, idempotente")
