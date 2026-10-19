package com.camo.onda;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.util.Locale;

@CapacitorPlugin(name = "Carpeta")
public class CarpetaPlugin extends Plugin {

    @PluginMethod
    public void elegir(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "resultadoCarpeta");
    }

    @ActivityCallback
    private void resultadoCarpeta(PluginCall call, ActivityResult r) {
        if (call == null) return;
        if (r.getResultCode() != android.app.Activity.RESULT_OK || r.getData() == null || r.getData().getData() == null) {
            call.reject("cancelado");
            return;
        }
        final Uri arbol = r.getData().getData();
        try { getContext().getContentResolver().takePersistableUriPermission(arbol, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { /* no es obligatorio */ }
        new Thread(() -> {
            try {
                JSArray lista = new JSArray();
                recorrer(arbol, DocumentsContract.getTreeDocumentId(arbol), lista);
                JSObject o = new JSObject();
                o.put("archivos", lista);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("No pude leer la carpeta: " + e.getMessage());
            }
        }).start();
    }

    private void recorrer(Uri arbol, String idDoc, JSArray salida) throws Exception {
        Uri hijos = DocumentsContract.buildChildDocumentsUriUsingTree(arbol, idDoc);
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };
        try (Cursor c = getContext().getContentResolver().query(hijos, cols, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0), nombre = c.getString(1), mime = c.getString(2);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { recorrer(arbol, id, salida); continue; }
                String n = nombre == null ? "" : nombre.toLowerCase(Locale.ROOT);
                boolean audio = (mime != null && mime.startsWith("audio/")) || n.matches(".*\\.(flac|mp3|m4a|aac|ogg|oga|opus|wav|alac|aiff?|wma)$");
                if (!audio) continue;
                JSObject f = new JSObject();
                f.put("uri", DocumentsContract.buildDocumentUriUsingTree(arbol, id).toString());
                f.put("nombre", nombre);
                f.put("mime", mime);
                f.put("tam", c.getLong(3));
                f.put("fecha", c.getLong(4));
                salida.put(f);
            }
        }
    }

    @PluginMethod
    public void copiar(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri"));
            File dir = new File(getContext().getCacheDir(), "onda");
            dir.mkdirs();
            File destino = new File(dir, call.getString("id", "x").replaceAll("[^A-Za-z0-9_]", "_"));
            try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(destino)) {
                byte[] b = new byte[1 << 16];
                int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
            }
            JSObject o = new JSObject();
            o.put("ruta", destino.getAbsolutePath());
            call.resolve(o);
        } catch (Exception e) {
            call.reject("No pude copiar el archivo: " + e.getMessage());
        }
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        String ruta = call.getString("ruta", "");
        File f = new File(ruta);
        if (f.getParentFile() != null && "onda".equals(f.getParentFile().getName())) f.delete();
        call.resolve();
    }
}
