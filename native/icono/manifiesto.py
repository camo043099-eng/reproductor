"""Alias de la actividad de inicio para cambiar el icono de Onda por temporada.

La actividad principal deja de ser la del lanzador; en su lugar hay un alias por
icono (normal, halloween, navidad, verano). Solo uno queda activo a la vez; el
cambio lo hace MotorPlugin.icono() con PackageManager.
"""
import re

TEMPORADAS = ["halloween", "navidad", "verano"]
NORMAL = "normal"
TODOS = [NORMAL] + TEMPORADAS

def quitar_lanzador_de_principal(x):
    """Quita la categoría LAUNCHER de la actividad MainActivity (no toca el resto)."""
    patron = re.compile(r'(<activity\b[^>]*android:name="\.MainActivity"[^>]*>.*?</activity>)', re.S)
    m = patron.search(x)
    if not m:
        raise RuntimeError("no encuentro la actividad MainActivity en el manifiesto")
    bloque = re.sub(r'\s*<category android:name="android\.intent\.category\.LAUNCHER"\s*/>', "", m.group(1))
    return x[:m.start()] + bloque + x[m.end():]

def alias(nombre):
    activo = nombre == NORMAL
    icono = "@mipmap/ic_launcher" if activo else "@mipmap/ic_onda_%s" % nombre
    return (
        '        <activity-alias android:name="com.camo.onda.Icono_%s" android:targetActivity=".MainActivity"'
        ' android:enabled="%s" android:exported="true" android:icon="%s" android:roundIcon="%s"'
        ' android:label="@string/app_name">\n'
        '            <intent-filter>\n'
        '                <action android:name="android.intent.action.MAIN" />\n'
        '                <category android:name="android.intent.category.LAUNCHER" />\n'
        '            </intent-filter>\n'
        '        </activity-alias>\n'
    ) % (nombre, "true" if activo else "false", icono, icono)

def agregar_alias(x):
    """Inserta los alias justo antes de </application>. Idempotente."""
    if "Icono_normal" in x:
        return x
    bloque = "".join(alias(n) for n in TODOS)
    return x.replace("</application>", bloque + "    </application>", 1)

def xml_adaptativo(nombre):
    """Icono adaptativo de una temporada (mipmap-anydpi-v26/ic_onda_<temporada>.xml)."""
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_onda_%s_fondo"/>\n'
        '    <foreground android:drawable="@mipmap/ic_onda_%s_frente"/>\n'
        '    <monochrome android:drawable="@mipmap/ic_onda_%s_mono"/>\n'
        '</adaptive-icon>\n'
    ) % (nombre, nombre, nombre)
