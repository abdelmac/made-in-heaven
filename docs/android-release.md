# Android release packaging

Run commands from the repository root. The release scripts use the existing
portable JDK/Android SDK discovered by `scripts/check-mobile.mjs`. They never
install an app or upload a release to Google Play.

## October 29 package update

The owner requested Android application ID **`com.solacepomodoro.myapp`**.
iOS remains `com.solace.pomodoro`. The matching package-specific signed AAB/APK
rebuild is verified, using the existing upload identity. The current exports
are `solace-com.solacepomodoro.myapp-1.0.0-1-signed.aab` and the matching `.apk`
under `.local/exports/`; verification results are recorded below. The October 28
files below contain the old Android ID and must not be uploaded to the new Play
record; they are retained as historical artifacts rather than overwritten.
The previously exported `solace-store-preparation-2026-10-28.zip` also contains
that old-ID AAB/APK; use the new package-specific files for this Play record.

## Unsigned bundle

```powershell
node scripts/build-android-release.mjs --version-code 1 --version-name 1.0.0 --store-billing
```

The default rebuilds the mobile interface, syncs Android plugins/assets, runs
Gradle `bundleRelease` and inspects the actual AAB protobuf manifest. `--skip-sync`
is appropriate only when the Android assets already contain the intended mobile
build. Gradle release configuration keeps `debuggable=false`.

The script exports the AAB plus a JSON verification record into ignored
`.local/exports/`. The record includes application ID, version, SDK levels,
permissions, signing certificate fingerprint when signed, file size and SHA-256.
It verifies every payload's JAR signature when signing is requested and rejects a
debug certificate, mismatched versions or unexpected billing/restricted
permissions. `--store-billing` requires both the Billing permission and supported
Billing Library metadata in the actual bundle. Omitting it requires the Billing
permission to be absent. An unsigned AAB cannot be uploaded to Play.

Choose a strictly increasing version code for every new Play upload; the script
cannot inspect your Play Console history. Version names are user-facing release
labels. Google documents the distinct roles of these values in
[Version your app](https://developer.android.com/studio/publish/versioning).

## Local upload identity on Windows

Use an existing upload key when one is already registered for this app. Do not
create a replacement key merely because you moved computers. Play's upload key
and Google's distribution signing key have different roles; see
[Sign your app](https://developer.android.com/studio/publish/app-signing).

Only when this project has no existing release identity:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android-release-signing.ps1 -Action Create
```

Creation refuses existing keystore, password, certificate or reservation files.
It creates RSA4096 key material with a 10,000-day certificate and the technical
label `CN=Solace Upload,C=FR`. A cryptographically random 48-byte password stays
in process memory. Keytool receives it through its child environment rather than
command arguments. The encrypted PKCS12 key and Windows current-user
DPAPI-protected password are stored under ignored `.local/signing/`, with access
restricted to the current Windows user and SYSTEM. The public PEM certificate
contains no private key. No password is written as plaintext or printed.

DPAPI protection binds the saved password to this Windows account. Preserve the
key and make the portable encrypted backup below before relying on this identity
for future updates. Neither the ignored directory nor the AAB is committed.

Inspect the existing certificate and build a signed release:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android-release-signing.ps1 -Action Check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android-release-signing.ps1 -Action Build -VersionCode 1 -VersionName 1.0.0 -StoreBilling
```

The signing environment is local to that PowerShell process and its build
children, then cleared. The build uses no persistent Gradle daemon or
configuration cache. A signed build exports a separate `-signed.aab` and report;
it does not imply Play enrollment, submission or review approval.

Add `-Apk` to the signing wrapper (or `--apk` to the Node builder with `--signed`)
to also prepare a release APK for installed-device QA. Its v2 signature must match
the AAB upload certificate; the helper checks package/version/SDK/debug metadata
and records the APK's SHA-256 in the AAB's JSON report. It never installs the APK.

## Owner-controlled portable backup

Choose an existing private directory on encrypted owner-controlled storage and a
new filename. Run interactively; the helper asks twice for a backup password
without echoing it. Use at least 16 characters and keep the password in your
password manager, separate from the backup.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android-release-signing.ps1 -Action Backup -BackupPath 'E:\PrivateBackups\solace-upload-backup.p12'
```

The helper imports the same key pair into a new PKCS12 file encrypted with that
owner-chosen password. It refuses an existing destination, leaves the working
identity unchanged, restricts the backup's ACL and verifies that its alias opens.
This portable file can later be opened by Android Studio or keytool on another
computer with the owner-held password. Preserve the public upload certificate
and compare its SHA-256 fingerprint with the verified AAB and Play Console before
future uploads. This procedure has not been run without an owner-chosen backup
destination and password.

## Platform requirements checked October 28, 2026

The app targets Android 16/API36 and supports Android 8/API26 onward. New phone
apps and updates must target API36 from August 31, 2026; see Google's
[target API requirement](https://developer.android.com/google/play/requirements/target-sdk).

`POST_NOTIFICATIONS` is requested through the explicit settings action. Exact
alarm access remains optional `SCHEDULE_EXACT_ALARM`, with approximate scheduling
when denied; the app does not declare `USE_EXACT_ALARM`. Android documents
[notification consent](https://developer.android.com/develop/ui/views/notifications/notification-permission)
and [exact alarm behavior](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms).

The native purchase integration uses `@capgo/native-purchases` 8.9.6, whose Android
dependency pins Play Billing 9.1.0. The bundle inspector requires supported
Billing Library metadata when `--store-billing` is selected. Google's current
[Billing deprecation table](https://developer.android.com/google/play/billing/deprecation-faq)
lists version 8's new-release deadline as August 31, 2027 and version 9's as
August 31, 2028. Store product setup, signed transaction verification and actual
store test purchases still need independent validation; a compiled bundle alone
does not establish that a subscription can be sold or restored. Native UI must
use the store's localized product details and keep Stripe Checkout/portal links
out of mobile purchase flows.

## Local verification record

Before adding the native purchase plugin, an unsigned 1.0.0/code1 bundle was
compiled and inspected successfully: package `com.solace.pomodoro`, min SDK26,
target SDK36, debugging off, 4,234,848 bytes. Its SHA-256 is
`4c9fc9d5e4f7383c241d7f2c3a353b2626fe483e138f940036777bdaf9d77f62`.
This historical artifact has no Billing permission and is not the final IAP
release.

The first upload identity was created locally on October 28, 2026. Its public
certificate SHA-256 is
`fb306c60c9b921d267eae19122a076168770226a51e7d7daf95b76c45e2b652e`.
The DPAPI-backed keystore was reopened successfully, restrictive file ACLs were
verified, and a repeated Create command refused to replace the identity.
No portable owner-password backup or store submission has occurred.

### Final signed candidate

The October 29 build completed and its signature/metadata checks returned exit
code0. Its verification record is
`.local/exports/solace-com.solacepomodoro.myapp-1.0.0-1-signed.aab.json`.

| Artifact                                                            |            Size | SHA-256                                                            |
| ------------------------------------------------------------------- | --------------: | ------------------------------------------------------------------ |
| `.local/exports/solace-com.solacepomodoro.myapp-1.0.0-1-signed.aab` | 4,944,300 bytes | `a713670f13f60e9452fbc8ab6f554a1a235dfbdb4a2da3685366420cb955cd6f` |
| `.local/exports/solace-com.solacepomodoro.myapp-1.0.0-1-signed.apk` | 5,202,033 bytes | `25355b9d272abaca79b51f85411f1e5ef0430478f3184efe5de16133f520e5ba` |

Both artifacts identify `com.solacepomodoro.myapp`, version `1.0.0`, code `1`,
minimum API26 and target API36, with debugging disabled and Billing Library
`9.1.0`. Their upload certificate remains
`fb306c60c9b921d267eae19122a076168770226a51e7d7daf95b76c45e2b652e`;
no upload identity was replaced. AAB payload signatures and the APK v2 signature
were checked.

The compiled Android manifest registers the new exact callback
`com.solacepomodoro.myapp://auth/callback`, without the older Android scheme.
The Java launcher remains `com.solace.pomodoro.MainActivity`; its namespace is
separate from the application ID and does not change the Play package. The same
rebuilt web index SHA-256,
`fb1361908c281b309651cf0866e2034ef3378b9e95c83713c08954402ff488b5`,
was verified in the AAB, APK and synced iOS assets. The iOS metadata keeps
`com.solace.pomodoro`.

The older October 28 files remain unchanged. Neither new artifact has been
installed on the owner's phone or uploaded to a store; real-device auth and
purchase tests remain separate work.

### Historical October 28 signed candidate — old Android ID

The frozen frontend/native source was rebuilt and both platforms were synced on
October 28, 2026. The signed Android build and release lint completed successfully.
The verification record is
`.local/exports/solace-1.0.0-1-signed.aab.json`.

| Artifact                                   |            Size | SHA-256                                                            |
| ------------------------------------------ | --------------: | ------------------------------------------------------------------ |
| `.local/exports/solace-1.0.0-1-signed.aab` | 4,946,296 bytes | `89595f383b815e3663f8a49032640c5d07de8c1a90ec6ccdaad07a41e883c31f` |
| `.local/exports/solace-1.0.0-1-signed.apk` | 5,201,913 bytes | `b8d50993f8cdc0c4cc7a2259e954efdceadab3d583ccef26b9e05a9e1857eea2` |

Both artifacts identify `com.solace.pomodoro`, version `1.0.0`, version code `1`,
minimum SDK26 and target SDK36, with debugging disabled. The AAB's complete
payload signatures were verified; the APK's v2 signature matches the same
RSA4096 upload certificate recorded above. Actual merged Billing Library metadata
is `9.1.0` and the Billing permission is present.

The packaged configs in both artifacts were read back and confirmed
`NativePurchases.autoFinishTransactions=false`, `debugLogging=false`, eight native
plugins and no remote WebView `server.url`. Both packages contain the current web
index SHA-256
`20db10ab6f536c5be58d8c66883ebf8a109643113c5a08410a8040f2e524e350`,
matching the rebuilt `mobile/dist` and the final synced Android/iOS assets. No
native `.so` libraries are packaged in these artifacts.

The release helper accepts build-tools36's `minSdkVersion` badging field as well
as the older `sdkVersion` spelling. Its final metadata/signature checks completed
with exit code0. Signing passwords are passed only to the Gradle child, not asset
bundling, Capacitor sync or inspection tools.

These files have not been uploaded to a store or installed on a phone. The signed
APK uses the new release upload certificate and cannot update the owner's
existing debug-signed installation. Use an owner-approved separate test
installation; do not uninstall the owner's debug app or discard its local data
as part of this handoff.

Installed-device testing, the final backend/legal configuration, developer
verification, store listing/screenshots, Data Safety declarations and any
required Play testing are separate from producing a signed AAB.
