p = "android/app/src/main/java/com/camo/onda/MainActivity.java"
s = open(p).read()
nuevo = """public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle b) {
        registerPlugin(CarpetaPlugin.class);
        super.onCreate(b);
    }
}"""
s = s.replace("public class MainActivity extends BridgeActivity {}", nuevo)
assert "CarpetaPlugin" in s, s
open(p, "w").write(s)
