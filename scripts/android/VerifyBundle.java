import com.android.aapt.Resources.XmlNode;
import com.android.aapt.Resources.XmlElement;
import com.android.aapt.Resources.XmlAttribute;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.jar.JarFile;

/** Inspect the actual AAB protobuf manifest and verify every payload's JAR signature. */
class VerifyBundle {
    static String attribute(XmlElement element, String name) {
        for (XmlAttribute attribute : element.getAttributeList()) {
            if (!attribute.getName().equals(name)) continue;
            if (!attribute.getValue().isEmpty()) return attribute.getValue();
            var primitive = attribute.getCompiledItem().getPrim();
            if (primitive.hasIntDecimalValue()) return Integer.toString(primitive.getIntDecimalValue());
            if (primitive.hasIntHexadecimalValue()) return Integer.toString(primitive.getIntHexadecimalValue());
            if (primitive.hasBooleanValue()) return Boolean.toString(primitive.getBooleanValue());
        }
        return "";
    }

    static void require(boolean valid, String message) {
        if (!valid) throw new IllegalStateException(message);
    }

    public static void main(String[] args) throws Exception {
        require(args.length == 5, "Expected bundle, versionCode, versionName, signed/unsigned and store-billing/no-billing.");
        boolean signed = args[3].equals("signed");
        boolean storeBilling = args[4].equals("store-billing");
        try (var bundle = new JarFile(Path.of(args[0]).toFile(), true)) {
            for (String name : List.of("BundleConfig.pb", "base/manifest/AndroidManifest.xml", "base/assets/public/index.html", "base/dex/classes.dex")) {
                require(bundle.getJarEntry(name) != null, "Bundle is missing " + name);
            }
            var manifest = XmlNode.parseFrom(bundle.getInputStream(bundle.getJarEntry("base/manifest/AndroidManifest.xml"))).getElement();
            String packageName = attribute(manifest, "package");
            require(packageName.equals("com.solace.pomodoro"), "Unexpected Android application ID.");
            require(attribute(manifest, "versionCode").equals(args[1]), "Unexpected bundle version code.");
            require(attribute(manifest, "versionName").equals(args[2]), "Unexpected bundle version name.");
            String minSdk = "", targetSdk = "";
            String billingVersion = "";
            List<String> permissions = new ArrayList<>();
            for (XmlNode node : manifest.getChildList()) {
                if (!node.hasElement()) continue;
                var element = node.getElement();
                if (element.getName().equals("uses-sdk")) {
                    minSdk = attribute(element, "minSdkVersion");
                    targetSdk = attribute(element, "targetSdkVersion");
                }
                if (element.getName().equals("uses-permission")) permissions.add(attribute(element, "name"));
                if (element.getName().equals("application")) {
                    require(!attribute(element, "debuggable").equals("true"), "Release bundle is debuggable.");
                    require(attribute(element, "allowBackup").equals("false"), "Private device backup must stay disabled.");
                    require(attribute(element, "usesCleartextTraffic").equals("false"), "Cleartext traffic must stay disabled.");
                    for (XmlNode child : element.getChildList()) {
                        if (child.hasElement() && child.getElement().getName().equals("meta-data") && attribute(child.getElement(), "name").equals("com.google.android.play.billingclient.version")) {
                            billingVersion = attribute(child.getElement(), "value");
                        }
                    }
                }
            }
            require(minSdk.equals("26") && Integer.parseInt(targetSdk) >= 36, "Unexpected SDK levels.");
            require(storeBilling == permissions.contains("com.android.vending.BILLING"), "Play Billing permission differs from the explicitly requested release mode.");
            if (storeBilling) require(billingVersion.matches("[0-9]+\\.[0-9]+(?:\\.[0-9]+)?") && Integer.parseInt(billingVersion.split("\\.")[0]) >= 8, "A supported Play Billing 8+ version must be present in bundle metadata.");
            for (String permission : List.of("android.permission.USE_EXACT_ALARM", "android.permission.MANAGE_EXTERNAL_STORAGE", "android.permission.QUERY_ALL_PACKAGES", "android.permission.REQUEST_INSTALL_PACKAGES")) {
                require(!permissions.contains(permission), "Unexpected restricted/store permission: " + permission);
            }
            String fingerprint = null;
            var entries = bundle.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                if (entry.isDirectory()) continue;
                try (var content = bundle.getInputStream(entry)) { content.transferTo(java.io.OutputStream.nullOutputStream()); }
                if (entry.getName().startsWith("META-INF/")) continue;
                var signers = entry.getCodeSigners();
                require(signed == (signers != null && signers.length > 0), "Bundle signature state differs from requested release mode.");
                if (!signed) continue;
                require(signers.length == 1, "Bundle contains multiple signing identities.");
                var certificate = (X509Certificate) signers[0].getSignerCertPath().getCertificates().getFirst();
                certificate.checkValidity();
                require(!certificate.getSubjectX500Principal().getName().contains("Android Debug"), "Release bundle uses a debug certificate.");
                String current = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
                require(fingerprint == null || fingerprint.equals(current), "Payloads use different signing certificates.");
                fingerprint = current;
            }
            require(!signed || fingerprint != null, "No upload certificate found.");
            System.out.println("{\"applicationId\":\"" + packageName + "\",\"versionCode\":" + args[1] + ",\"versionName\":\"" + args[2] + "\",\"minSdk\":" + minSdk + ",\"targetSdk\":" + targetSdk + ",\"debuggable\":false,\"signed\":" + signed + ",\"storeBilling\":" + storeBilling + ",\"playBillingLibraryVersion\":\"" + billingVersion + "\",\"uploadCertificateSha256\":" + (fingerprint == null ? "null" : "\"" + fingerprint + "\"") + ",\"permissions\":[\"" + String.join("\",\"", permissions) + "\"]}");
        }
    }
}
