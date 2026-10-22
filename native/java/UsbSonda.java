package com.camo.onda;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;

/** Sonda de DAC USB: lee los descriptores del dispositivo para saber si un driver propio sería viable (versión UAC, formatos, endpoints). Solo lee, no toca el audio. */
public final class UsbSonda {
    public interface Fin { void listo(boolean ok, String motivo, String texto, String hex); }
    private static final String ACCION = "com.camo.onda.USB_PERMISO";

    private UsbSonda() { }

    public static void analizar(final Context ctx, final Fin fin) {
        try {
            final UsbManager um = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
            UsbDevice dac = null;
            for (UsbDevice d : um.getDeviceList().values()) {
                for (int i = 0; i < d.getInterfaceCount() && dac == null; i++) if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_AUDIO) dac = d;
                if (dac != null) break;
            }
            if (dac == null) { fin.listo(false, "sin-dispositivo", "", ""); return; }
            final UsbDevice dev = dac;
            if (um.hasPermission(dev)) { responder(um, dev, fin); return; }
            BroadcastReceiver rec = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    try { c.unregisterReceiver(this); } catch (Exception e) { /* ya estaba suelto */ }
                    if (i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) responder(um, dev, fin);
                    else fin.listo(false, "permiso-denegado", "", "");
                }
            };
            IntentFilter f = new IntentFilter(ACCION);
            if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(rec, f, Context.RECEIVER_NOT_EXPORTED); else ctx.registerReceiver(rec, f);
            Intent in = new Intent(ACCION).setPackage(ctx.getPackageName());
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            um.requestPermission(dev, PendingIntent.getBroadcast(ctx, 0, in, fl));
        } catch (Throwable t) { fin.listo(false, "error: " + t, "", ""); }
    }

    private static void responder(UsbManager um, UsbDevice d, Fin fin) {
        UsbDeviceConnection c = null;
        try {
            c = um.openDevice(d);
            if (c == null) { fin.listo(false, "no-abre", "", ""); return; }
            byte[] raw = c.getRawDescriptors();
            fin.listo(true, "", describir(d, raw), hex(raw));
        } catch (Throwable t) { fin.listo(false, "error: " + t, "", ""); }
        finally { if (c != null) c.close(); }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x & 0xFF));
        return s.toString();
    }

    /** Resumen legible de los descriptores de audio: versión UAC, formatos de cada interfaz de streaming y sus endpoints. */
    static String describir(UsbDevice d, byte[] raw) {
        StringBuilder t = new StringBuilder();
        t.append(d.getProductName()).append(" (").append(String.format("%04x:%04x", d.getVendorId(), d.getProductId())).append(")\n");
        int uac = 0, ifc = -1, alt = -1, cls = 0, sub = 0;
        for (int p = 0; p + 2 <= raw.length; ) {
            int len = raw[p] & 0xFF; if (len < 2 || p + len > raw.length) break;
            int ty = raw[p + 1] & 0xFF;
            if (ty == 4 && len >= 9) {                                  // descriptor de interfaz
                ifc = raw[p + 2] & 0xFF; alt = raw[p + 3] & 0xFF; cls = raw[p + 5] & 0xFF; sub = raw[p + 6] & 0xFF;
                int proto = raw[p + 7] & 0xFF;
                if (cls == 1 && sub == 1) { uac = proto == 0x20 ? 2 : 1; t.append("Control de audio: UAC").append(uac).append("\n"); }
                if (cls == 1 && sub == 2 && alt > 0) t.append("Interfaz ").append(ifc).append(" alt ").append(alt).append(":\n");
            } else if (ty == 0x24 && cls == 1 && sub == 2 && len >= 6) {   // descriptor propio de audio en una interfaz de streaming
                int st = raw[p + 2] & 0xFF;
                if (st == 2) {                                           // FORMAT_TYPE
                    if (uac == 1 && len >= 8) {
                        int ch = raw[p + 4] & 0xFF, bytes = raw[p + 5] & 0xFF, bits = raw[p + 6] & 0xFF, tf = raw[p + 7] & 0xFF;
                        t.append("  formato: ").append(ch).append(" canales, ").append(bytes).append(" bytes, ").append(bits).append(" bits");
                        if (tf > 0) { t.append(", tasas:"); for (int k = 0; k < tf && p + 8 + 3 * k + 2 < p + len; k++) t.append(' ').append((raw[p + 8 + 3 * k] & 0xFF) | ((raw[p + 9 + 3 * k] & 0xFF) << 8) | ((raw[p + 10 + 3 * k] & 0xFF) << 16)); }
                        else t.append(", tasas continuas");
                        t.append("\n");
                    } else if (uac == 2) {
                        t.append("  formato: ").append(raw[p + 4] & 0xFF).append(" bytes por muestra, ").append(raw[p + 5] & 0xFF).append(" bits\n");
                    }
                }
            } else if (ty == 5 && len >= 7 && cls == 1 && sub == 2) {    // endpoint de una interfaz de streaming
                int addr = raw[p + 2] & 0xFF, attr = raw[p + 3] & 0xFF, mps = (raw[p + 4] & 0xFF) | ((raw[p + 5] & 0xFF) << 8), iv = raw[p + 6] & 0xFF;
                t.append("  endpoint 0x").append(String.format("%02x", addr)).append((addr & 0x80) != 0 ? " IN" : " OUT")
                 .append(" tipo ").append(attr & 3).append(" (1 = isócrono) sync ").append((attr >> 2) & 3).append(" paquete ").append(mps).append(" intervalo ").append(iv).append("\n");
            }
            p += len;
        }
        return t.toString();
    }
}
