# Solace mobile apps

October 29 identity update: Android now targets the owner's requested
**`com.solacepomodoro.myapp`**, with callback
**`com.solacepomodoro.myapp://auth/callback`**. The matching signed AAB/APK rebuild
is verified, the hosted callback was added and independently read back, and the
matching backend deployment `dpl_GAXwpaUbV5xhKD1FGwhCuWGN33xP` is READY at
`www.solace-pomodoro.com`. The iOS
identity and callback remain **`com.solace.pomodoro`** and
**`com.solace.pomodoro://auth/callback`**. The October 28 Android artifacts below
use the older identity and must not be uploaded to the new Play record.
The rebuilt mobile bundle has passed 26 intercepted native-browser scenarios,
including the new Android callback. This is not a new-package OS installation or
an actual store purchase result.

October 28 release handoff: native purchase/restore/manage flows and legal acceptance are implemented, all 15 database migrations are hosted, and signed Android 1.0.0/code1 AAB/APK files are verified locally. See [Android artifacts](android-release.md), [iOS Mac handoff](ios-release.md), [store readiness](store-readiness.md), and [remaining owner actions](publication-owner-actions.md). Store products and credentials, real sandbox purchases, final policy approval and store submission remain pending. Vercel Pro was prepared but the owner left the upgrade pending, so paid production sales remain closed. Historical preparation notes below do not supersede this status.

The mobile client reuses Solace’s React workspace and bundles it with Capacitor 8.
Its pages, fonts and local workspace are available without downloading the website.
The Next.js server and its database remain hosted separately.

The Android project is `android/` and uses application ID
**`com.solacepomodoro.myapp`**. The iOS project is `ios/App/App.xcodeproj` and
keeps bundle ID **`com.solace.pomodoro`**. Callback routing must use the actual
runtime platform's exact scheme. The new package has separate Android app data
and sessions; it does not import, overwrite or delete the old debug installation.

Use the platform wrapper for direct Capacitor commands:
`node scripts/capacitor-platform.mjs sync android` or
`node scripts/capacitor-platform.mjs sync ios`. The `npm run mobile:*` commands
below select the platform explicitly. Raw Capacitor commands without the wrapper's
platform environment are refused, so a generic sync cannot copy the Android app
identifier into iOS metadata.

## Build and preview commands

Run these commands from the repository root after `npm ci`:

| Command                  | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `npm run mobile:dev`     | Start the mobile interface development server on port 5173.              |
| `npm run mobile:build`   | Produce the bundled client in `mobile/dist`.                             |
| `npm run mobile:preview` | Serve that built interface on port 4173 for browser inspection.          |
| `npm run test:mobile`    | Run the separate browser suite against the built mobile interface.       |
| `npm run mobile:sync`    | Rebuild the interface and sync native plugins/assets into both projects. |
| `npm run mobile:doctor`  | Check the local Android toolchain and report iOS availability.           |
| `npm run mobile:apk`     | Rebuild, sync and compile an Android debug APK.                          |
| `npm run mobile:android` | Sync and open the Android project in Android Studio.                     |
| `npm run mobile:ios`     | Sync and open the iOS project in Xcode on macOS.                         |
| `npm run mobile:assets`  | Regenerate mobile Solace icons, launch images and timer sound.           |

The browser preview checks layout and ordinary local interactions. It does not
exercise native plugins, mobile session storage, notification delivery or native
API authentication; use installed phone builds for those checks.

The dedicated browser suite also contains a deterministic Capacitor bridge fixture
with mocked preferences, secure storage, authentication and API responses. It
checks the real bundled JavaScript’s native startup, isolated session storage,
bearer requests and restoration after reload. Authentication scenarios also cover
signup with its persisted PKCE verifier, cold-start and repeated callbacks,
password recovery while the account dialog is open, and rejection of expired
codes or codes without this installation’s verifier. Provider responses are
intercepted locally; these fixtures do not establish email delivery, actual
device encryption, native notification delivery or hosted account sync.
The mocked sign-in scenario needs public Supabase configuration in the bundle and
is skipped when that configuration is absent; all provider requests in that
scenario are intercepted.

## Android development on Windows

Use JDK 21, Android SDK platform 36 and build-tools 36.0.0. An existing installation
can be selected with `JAVA_HOME` and `ANDROID_HOME` or `ANDROID_SDK_ROOT` for the
current terminal. Android Studio’s SDK Manager can install the required packages.
The app supports **Android 8.0/API 26 and later**, with compile/target SDK 36.

The repository also provides `scripts/setup-android-tools.ps1`. It downloads a
portable JDK and the official Android command-line tools under
`.local/mobile-tools`, verifies archive checksums and installs the SDK packages.
Review and agree to the Android SDK license terms before using its
`-AcceptLicenses` option:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-android-tools.ps1 -AcceptLicenses
npm run mobile:doctor
npm run mobile:apk
```

The doctor and APK runner discover that portable JDK/SDK automatically. The runner
sets paths only for its child processes; it does not change machine environment
variables. Gradle caches and Android user files are placed under
`.local/mobile-tools`. The SDK location written to `android/local.properties` is a
local ignored file and must not be committed.

Android's FileProvider exposes only app-private `Cache/exports/` for exports and
the app's external-files `Pictures/` folder used by the standard camera chooser.
It does not expose a cache root, external-files root, external-storage root or
filesystem root. Device backup is disabled for the app's private workspace files.

On success the APK is available at:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `.local/exports/solace-debug.apk`

The script reports success only after Gradle produces the APK. This is a debug
build for testing, not a signed Google Play release. A freshly synced build can
be compiled again with `npm run mobile:apk -- --skip-sync`; omit that option after
changing client code, configuration or plugins.
The final October 27 debug APK compiled successfully and its package identifier,
SDK levels and v2 debug signature were verified. Its size and checksum are in the
[verification record](verification.md).

Enable USB debugging on an Android test phone and use Android Studio’s device
installer, or run `adb install -r .local/exports/solace-debug.apk` using the selected
SDK’s `platform-tools/adb` executable. An emulator also needs a separately installed
system image; the portable setup does not install one.

## iOS development

The iOS project uses Swift Package Manager. Compiling, running or archiving it
requires macOS and Xcode 26 or later; Windows can prepare the source and bundled
assets but cannot validate an iOS binary. On the Mac, install dependencies, run
`npm run mobile:ios`, select your Apple developer team and a test device in Xcode,
then build and run. Keep release signing keys and provisioning information out of Git.

## Hosted backend and authentication

The updated Next.js backend was deployed to `https://www.solace-pomodoro.com` and
its native API transport checks passed on October 27. Deploy the same updated
backend before targeting another environment with a connected native account. It
includes exact native-origin CORS handling for `capacitor://localhost` on iOS and
`https://localhost` on Android. Installed clients authenticate with their own
verified bearer token; they do not reuse website cookies. Browser requests retain
the existing same-origin checks and cookie authentication.
Each mobile-facing API route owns its CORS response wrapper and explicit
`OPTIONS` handler. Proxy is retained as defense in depth, but it is not the CORS
or authentication security boundary: the initial Next.js/Vercel integration check
showed that Proxy alone did not attach the required headers. The route-level
integration tests exercise actual HTTP responses, including authorization errors.

The default API origin is `https://www.solace-pomodoro.com`. To target a separate
HTTPS staging backend, set `SOLACE_MOBILE_API_ORIGIN` before building; use a bare
origin without a path, query or fragment. The mobile build only includes the
explicitly selected public application/Supabase settings. Private server keys and
payment secrets must stay on the hosted server.

Configure the public Supabase URL and publishable key with the usual
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` environment
variables before building. An ignored `.local/mobile-public.json` may alternatively
provide the `supabaseUrl` and `supabaseKey` fields; explicit environment variables
take precedence. This file is for public client configuration only and must never
contain a service-role key, database password or other server credential. When no
public Supabase configuration is supplied, the client remains usable locally and
its account sign-in form is unavailable.

To reuse the current hosted project's public connection settings without
downloading its server credentials into a local environment file, the following
workflow was verified with Vercel CLI 59.25.4:

```powershell
npx.cmd vercel@59.25.4 env run -e production --project solace-hikmagitz --scope hikmagitzs-projects -- node scripts/capture-mobile-public.mjs
npm run mobile:build
npm run mobile:sync
```

The capture helper saves only the public Supabase URL and publishable/anon key in
ignored `.local/mobile-public.json`. The mobile environment loader reuses the
`invalidSupabaseVariables` credential guard before bundling; it rejects a secret
or service-role key in either public key setting. Recreate the public configuration
on another development machine because this file is not committed.

The matching Supabase project allows
`com.solacepomodoro.myapp://auth/callback` under **Authentication → URL Configuration →
Redirect URLs**, alongside `com.solace.pomodoro://auth/callback` for iOS and the
older Android installation. Adding a native scheme to another codebase or
environment does not automatically update its hosted
allowlist. Use PKCE confirmation/recovery links; the native handler accepts the
exact callback and exchanges a code or supported token hash rather than accepting
arbitrary access-token fragments. Verify signup confirmation and password recovery
on the same installation that started the flow. Keep the existing website callback
available for website users.
The hosted redirect allowlist for **Solace Hikmagitz** (`zwgjauskorkpucuaqvgs`)
was updated and read back on **October 28, 2026**. At that time the older mobile
callback was allowed alongside the website redirect, with two entries in total.
On October 29, the new Android callback was appended and independently read
back, preserving both existing entries and their order. The allowlist now has
three entries. Apply changed only the one allowlist field in one Auth write;
independent verification reported no remaining changes and zero writes. The
protected Auth snapshot, including SMTP and the signup hook, stayed unchanged.
No email or account was created by that configuration verification.
The CLI preview and verification confirmed only `auth.additional_redirect_urls`
needed updating. Password sign-in and session restoration after a full app restart
were later verified on the installed Android app, along with personal-workspace
task creation, cloud readback and cleanup. An existing account's recovery email
also opened the correct Android password form. The owner confirmed a successful
different-password update and new sign-in; device inspection confirmed recovery
mode cleared and the personal workspace synchronized. New-account signup
confirmation initially hit the built-in email sender's rate limit. Resend SMTP
has since been activated and independently verified at 30 emails per hour;
protected Auth settings were preserved. The owner then reported receiving the
signup email and opening it on the same Note10, which signed them in. Status-only
inspection confirmed the signed-in personal cloud workspace before and after a
full app restart. Details are in [auth-mail.md](auth-mail.md). The iOS account
flow has not been run on a built app.

Native refresh tokens are held in encrypted Android Keystore/iOS Keychain storage.
Workspace documents, appearance and pending sync state use app-private native
Preferences storage. They remain scoped by user and workspace. Native persistence
does not import or upload a browser’s existing local workspace automatically.

Native exports use a separate UUID folder for every handoff under the app-private
`Cache/exports/` directory. Files remain available after the share sheet resolves
because a receiving app can read the granted URI afterward. On app startup and
before a later export, cleanup removes only validated export UUID directories
older than 24 hours, using fresh filesystem metadata and skipping active handoffs.
The original JSON/ICS filename is preserved inside its unique folder. This
handoff behavior has regression coverage but has not been tested with recipients
on a physical phone.

## Device verification

### Authentication on a test phone

Use a separate test account and open email links on the same installation that
requested them. Enable USB debugging on an Android test phone, approve the
computer’s debugging prompt and install `.local/exports/solace-debug.apk` with
`adb install -r .local/exports/solace-debug.apk`.

1. Create the test account in Solace. Open its confirmation email on that phone
   and confirm the link opens Solace with the intended account signed in.
   Repeat with a fresh test account after closing Solace before opening the link
   to check cold-start handling.
2. Close and reopen the app, then sign out and sign in with the test password.
   Confirm the account and workspace are restored.
3. Request a password reset in Solace, leaving its account dialog open. Open the
   recovery link on that phone. Confirm the new-password form appears, save a
   replacement password and verify it can sign in after signing out.
4. Reopen a redeemed confirmation/recovery link. Confirm a safe error appears
   without exposing codes or tokens in the interface or navigation URL.
5. Create a uniquely named task, wait for synchronization and confirm it appears
   in another signed-in client for the same test workspace. Repeat after making
   an offline change and reconnecting the phone.

The October 28 automated run did not have an attached Android device or an
installed emulator. Later that day, the verified debug APK was installed and
opened on a Galaxy Note10 running Android 12 through authenticated wireless
debugging. Native startup, password sign-in, session restoration after a full
app restart and personal-workspace task saving/readback/cleanup were verified.
A recovery email opened the password form on that installation. After an expected
same-password rejection, the owner confirmed a different-password update and
new sign-in; device inspection confirmed the signed-in, synchronized state and
cleared recovery mode. After configuring Resend SMTP, the owner also confirmed
receiving and opening the signup email on the same phone, which signed them in.
The signed-in personal cloud workspace was inspected before and after another
full app restart. This checks session restoration after confirmation; opening
the confirmation link while the app is stopped remains a separate test, as does
password-reset delivery through Resend. The iOS equivalent requires a built app
on an iPhone or simulator with macOS/Xcode.

### Other device checks

Before treating either platform as ready, test these behaviors on an installed app:

1. Start a timer, lock the phone and background the app. Return after the deadline
   and confirm one completed session with the expected context.
2. Enable notifications explicitly in Settings. Confirm sound/silent preferences,
   pause/reset cancellation and notification behavior after restarting the app.
   Android exact-alarm access is optional and controlled in system settings;
   without it the operating system may delay reminders.
3. Create local work, close and reopen the app, then repeat in airplane mode.
   Reconnect and verify the pending changes reach the correct account/workspace.
4. Sign in, sign out, switch workspaces and complete valid/expired confirmation and
   recovery links. Confirm another account cannot access the first account’s data.
5. Export JSON/history/flashcards/ICS using the system share sheet, cancel a share,
   import a backup and choose a background image. External resources and policy
   pages should open in the system browser while workspace links stay in Solace.
6. Test the on-screen keyboard, Android Back button, safe areas, larger text,
   accessibility and both appearances on small and large phones.

Focus audio currently uses foreground web audio. A background-audio service,
lock-screen media controls and reliable playback while suspended are not part of
this mobile implementation.

The local verification record is in [verification.md](verification.md). Browser
bridge fixtures test the bundled native branches using mocked plugins; an APK
compile proves Android source/build integration. Neither replaces installed-device
checks of notification delivery, OS suspension, encryption, file recipients or
authenticated hosted saves. The iOS source and seven native plugins were generated
and synced, but no Xcode compile or iOS device execution was performed on Windows.

## Work after this mobile development step

Native paid purchases are intentionally unavailable in this version. The mobile
offer screen shows verified account access without sending people to Stripe
Checkout or its customer portal. StoreKit/Google Play Billing, purchase restoration
and verified store entitlement handling remain a separate implementation step.

The next preparation step now includes a public `/account-deletion` page, a
browser entry into the authenticated deletion flow, current-password verification,
immediate cancellation of personal web subscriptions, and transactional cleanup
of attributable shared content. Three native-bridge browser regressions passed;
they use synthetic accounts and do not delete a real hosted account. The SQL
migration and matching backend/public pages have not been deployed. The privacy
draft and store-disclosure inventory are in [store-readiness.md](store-readiness.md).
Publisher identity, a working support inbox, final retention/policy decisions and
hosted/device deletion verification remain needed. Release signing, store
screenshots, TestFlight/Play testing and review submission are also separate work.
Creating these projects does not publish either app to a store.
