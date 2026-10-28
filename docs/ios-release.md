# iOS release handoff

The iOS project is prepared in this repository, but no iOS archive, signed IPA,
TestFlight build or App Store submission has been produced on Windows. A Mac
with Xcode and access to the owner's Apple developer team is required.

Apple requires uploads to be built with **Xcode 26 or later and an iOS 26 or later
SDK**, effective April 28, 2026. Since September 9, 2026 the minimum supported
iOS deployment target must be iOS 13 or later. Solace's existing iOS 15 deployment
target satisfies that separate requirement. Check Apple's
[current upload requirements](https://developer.apple.com/news/upcoming-requirements/)
again before submitting.

## Project and owner-supplied values

| Item                     | Repository state or required owner input                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Project and scheme       | `ios/App/App.xcodeproj`, target/scheme `App`                                                                    |
| App name                 | Solace                                                                                                          |
| Bundle identifier        | `com.solace.pomodoro`; keep it identical in Xcode, Developer portal, App Store Connect and server configuration |
| Supported systems        | iOS/iPadOS 15+, iPhone and iPad                                                                                 |
| Current project defaults | Marketing version `1.0`, build `1`; choose the release version/build explicitly before archiving                |
| Signing team             | No `DEVELOPMENT_TEAM` is checked in; select the owner's existing team in Xcode                                  |
| Signing                  | Automatic style is configured; the owner needs suitable Apple Distribution signing/provisioning access          |
| App Store record         | Owner's app name, primary language, bundle ID and unique SKU; do not invent the seller identity                 |
| Developer account        | Existing Apple Developer Program membership and App Store Connect role with access to this app                  |
| Business fields          | Owner legal/trader identity, review contact, tax/banking and applicable agreements for paid subscriptions       |
| Store listing            | Final support/privacy URLs, description, category, age-rating answers, screenshots and review notes/test access |
| Export compliance        | Answer for the actual shipped encryption; the source does not predeclare `ITSAppUsesNonExemptEncryption`        |

Apple describes the app-record fields in
[Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/).
App privacy answers must cover the shipped app and its services, including the
coarse online age declaration and any synchronized content. A privacy manifest
is not a substitute for those answers; see
[Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).
The local tools are available without an account; the online 16+ declaration
does not itself determine the store's content age rating or establish verified
age or parental permission.

## Native linkage and assets

Capacitor uses Swift Package Manager through `ios/App/CapApp-SPM/Package.swift`.
Run `npm ci` on the Mac before opening Xcode: local Swift packages resolve through
`node_modules`. The generated package links Capacitor 8.5.3 and eight native
plugins, including `CapgoNativePurchases` from `@capgo/native-purchases` 8.9.6.
The generated package must be regenerated through Capacitor rather than edited
by hand.

```sh
npm ci
npm run mobile:build
npx cap sync ios
open ios/App/App.xcodeproj
```

The final sync must happen after the intended frontend source is frozen. It
copies the current web assets and the static purchase configuration into the
app. In the generated `ios/App/App/capacitor.config.json`, confirm:

```json
{
  "plugins": {
    "NativePurchases": {
      "autoFinishTransactions": false,
      "debugLogging": false
    }
  }
}
```

The plugin starts observing StoreKit transactions when its native plugin loads;
this static setting prevents finishing a transaction before Solace's server
accepts its proof. Ordinary monthly subscriptions use StoreKit 2. The installed
plugin guards newer StoreKit 26.5-only APIs conditionally; Solace does not request
its optional billing-plan purchase options. This source inspection does not
replace compiling the plugin with the selected Xcode version.

The project contains the app icon, splash assets, timer sound and
`PrivacyInfo.xcprivacy` in its resource build phase. The manifest declares no
tracking and records required-reason API purposes for UserDefaults, file
timestamps and disk space. Review Xcode's combined privacy report, including
third-party SDKs, against the final disclosure inventory.

The registered email callback is `com.solace.pomodoro://auth/callback`.
`SceneDelegate` forwards cold-start URL contexts and warm URL deliveries through
Capacitor's scene proxy. The hosted Auth allowlist and email templates must match
the current frontend/server release. Native notifications are local; this source
does not configure an APNs push-notification service or a background audio mode.

## Subscription configuration before store testing

Create or select the owner's auto-renewable monthly subscription and subscription
group in App Store Connect. Use the approved monthly price in the selected
storefronts; the app displays Apple's localized product price rather than a
hardcoded conversion. Match the exact product ID to `APPLE_IAP_PRODUCT_ID`.

The backend needs the app's numeric Apple ID, the correct sandbox/production
environment, App Store Server API issuer/key IDs and the private signing key.
These belong in the hosted server's secret configuration, never the iOS project,
mobile public settings, screenshots, Git or chat. The public bundle ID remains
`com.solace.pomodoro`. Configure App Store Server Notifications V2 to the deployed
Apple notification endpoint and verify notification handling in the chosen test
environment. No store products or keys have been created by this handoff.

Use an owner-controlled sandbox account and a separate Solace test account for
purchase testing. StoreKit/Xcode local test transactions do not prove the real
server's Apple signature/account/environment checks. Verify an actual supported
sandbox/TestFlight path before enabling production purchases.

## Archive and inspect on the owner's Mac

1. Select the existing developer team and verify the bundle ID in Xcode's
   Signing & Capabilities settings. Enable the In-App Purchase capability for the
   registered App ID as required by the owner's account. Keep private signing
   keys in the owner's Keychain; do not export them into this repository.
2. Choose a unique build number and the intended marketing version, for example
   `1.0.0` and `1`. Select a generic iOS device/archive destination and the Release
   configuration. Build/run on an actual iPhone and iPad before archiving.
3. Use Product → Archive. In Organizer, inspect the archive and use Validate App.
   Fix validation errors and review privacy/SDK notices. Do not treat an archive
   operation alone as validation or a store submission.
4. Export an owner-controlled App Store Connect distribution IPA for inspection.
   An archive may initially carry a development signature and be resigned during
   export; inspect the exported distribution payload, not a simulator or debug
   app.

An optional local command can produce the archive after the owner has configured
the signing team and provisioning profile in Xcode:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$PWD/.local/ios/Solace.xcarchive" \
  MARKETING_VERSION=1.0.0 CURRENT_PROJECT_VERSION=1 \
  DEVELOPMENT_TEAM="$SOLACE_APPLE_TEAM_ID" archive
```

The team ID is a public identifier, not an Apple password. This example does not
create signing credentials or pass `-allowProvisioningUpdates`; configure the
required signing access in Xcode first. No archive command has been executed in
this Windows workspace.

After extracting an exported IPA to an owner-controlled local directory, inspect
its actual `.app` on the Mac:

```sh
node scripts/verify-ios-app.mjs \
  --app '/absolute/path/Payload/App.app' --version 1.0.0 --build 1
```

The script reads the app's plist, device platform, SDK/version, bundled assets,
privacy manifest and static purchase settings. It verifies the existing code
signature and rejects debugger entitlements. It does not archive, resign, access
Apple account credentials or upload anything. Its actual macOS execution remains
unverified until the owner runs it against an exported distribution app.

## Device, TestFlight and review validation

Check sign-up/confirmation, password recovery, ordinary sign-in, age/terms
acceptance, local offline work, cloud isolation, native file exports, notification
consent and a locked/backgrounded timer. Exercise both iPhone and iPad layouts,
larger text, VoiceOver, privacy links and the account-deletion entry.

For subscriptions, check purchase cancellation, pending payments, account
mismatch, restore after reinstall/restart, server outage/retry, renewal and refund
handling, and opening Apple's subscription-management screen. Confirm an
unfinished transaction is recovered without a second payment and that deleting
the Solace account does not claim to cancel an App Store subscription.

Uploading a validated build to App Store Connect/TestFlight and submitting it for
review are separate owner-account actions. Xcode Organizer and Transporter are
supported upload paths; no upload is performed by the scripts in this handoff.
Apple documents [build upload](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
and the [publication workflow](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/overview-of-publishing-your-app-on-the-app-store/).
Complete the final legal/support fields and test results before selecting a
release for review.
