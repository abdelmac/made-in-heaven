# Solace publication: remaining owner actions

Reviewed **October 28, 2026** against official provider and store documentation.
This is a publication handoff, not proof of store approval or finalized policies.
The web release is live at `www.solace-pomodoro.com`; its legal/privacy pages remain
provisional drafts with `noindex` metadata. Technical implementation and verification belong in
[store-readiness.md](store-readiness.md) and [mobile.md](mobile.md).

**October 29 Android identity update:** the owner requested
`com.solacepomodoro.myapp` for Google Play. iOS remains `com.solace.pomodoro`.
The matching signed Android AAB/APK rebuild, hosted callback addition and backend
deployment are verified. The new deployment is
`dpl_GAXwpaUbV5xhKD1FGwhCuWGN33xP`, aliased to `www.solace-pomodoro.com`.
The Auth allowlist now has three entries, preserving the website and older
mobile callbacks while appending `com.solacepomodoro.myapp://auth/callback`.
Do not use the October 28
`com.solace.pomodoro` AAB for the new Play record. The existing upload key is
preserved. The Play app record's existence has not been independently verified.

## Information already supplied

- Legal publisher: **Machta Abdelkader**; individual, based in **France**.
- Public display name: **ennearock**.
- Public support contact: **quetzal.hkm@gmail.com**.
- Requested Pro price: **€1 per month**. No yearly price has been confirmed.
- Native Pro through **Apple In-App Purchase and Google Play Billing** was chosen.
- The Vercel Pro upgrade remains pending. Commercial production purchases stay
  closed while the deployment remains on Hobby.
- The owner reported completing developer-account setup. Do not register or pay
  again without checking the existing accounts.
- Public postal contact, phone and business details have **not** been arranged.
  Individual publication and a nickname do not resolve the applicable trader or
  professional-publication obligations. Commercial sales remain closed.

## Completed technical preparation

The private-mood, account-deletion, native-billing and legal-acceptance migrations
are applied to the hosted database; native billing remains bound to sandbox.
The October 29 full unit run passed **798 tests in 66 files**, and the isolated SQL
run passed **516 assertions across 15 migrations and 12 suites**. Six Chrome
public/deletion tests passed against the real deployed domain, with checkout
disabled. These checks did not perform an Apple/Google purchase.

The signup-policy Auth hook is enabled at
`pg-functions://postgres/public/folia_before_user_created` and independently
verified. Only its two declared fields changed, in one Auth configuration write;
protected SMTP/redirect settings remained unchanged and verification made no
writes. Hosted pure-function checks accepted 16–17/adult declarations and rejected
under-16, missing and unaccepted declarations. Deployed UI dry checks confirmed
neutral age selection, no identity form for under-16s and explicit legal acceptance.
These checks created no account/email. **Owner-run end-to-end new signup and email
confirmation remain to be tested.** See [hook evidence](account-signup-hook.md).

Signed Android AAB/APK candidates are built and verified, but not installed or
submitted. See [artifact records](android-release.md#final-signed-candidate).
Installed-device QA, the owner-controlled upload-key backup, iOS archive/signing,
store records and real purchase tests remain separate work.

The nickname is separate from the verified seller identity. Apple individual
enrollment displays the legal personal name. Google allows a different developer
display name, but publishes verified identity information too. Google says a
personal account's legal name, country and developer email are public; monetizing
on Google Play also makes the full address public. See
[Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment)
and [Google identity requirements](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en).

## Decisions and information that cannot be invented

| Owner action                                                                       | Why it is needed                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create the selected native monthly products and complete paid-app agreements.      | Native Pro was selected. Store product records, merchant/tax/bank details, API access and real store testing remain external account tasks.                                                                                                                                      |
| Complete the store audience questionnaires and select European countries.          | The owner chose everyone, especially students, in Europe. The initial implementation has local tools for all ages and self-declared 16+ online accounts/Pro. Content ratings and child-directed audience declarations require separate, truthful answers.                        |
| Arrange applicable public postal/phone details and resolve trader/business status. | The owner has not arranged these details. France is a country, not a postal address. A nickname and individual account do not establish non-trader status. Do not invent a company, registration number or address.                                                              |
| Confirm the hosting plan and approved operating budget.                            | Commercial use is outside Vercel Hobby's stated permitted use. Paid hosting or another appropriate arrangement may be required even when the mobile download is free.                                                                                                            |
| Review the final factual privacy/terms disclosures.                                | Confirm retained support/billing records, handling of rights requests, provider arrangements and whether mood processing needs additional safeguards. No arbitrary retention period has been selected. The chosen audience remains local all ages, online/Pro self-declared 16+. |

For EU distribution, Apple requires the developer to declare trader status. An
individual trader must verify and display an address or P.O. Box, phone number and
email. Alternate-address documentation is required. These are store requirements;
a P.O. Box is not automatically sufficient for every other legal notice. See
[Apple EU trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

## Native purchases: selected release behavior

The current app disables native Stripe Checkout and the Stripe portal. This
prevents direct native web checkout, but does not by itself establish an Apple
purchase exemption. Apple's current guideline 3.1.3(f) names companions for VoIP,
cloud storage, email or web hosting; Solace's productivity features do not clearly
fit those categories. Guideline 3.1.3(b) normally requires cross-platform paid
features to also be available through in-app purchase. The selected implementation
uses native purchases. Do not claim that existing web Pro entitlements are
automatically exempt. See [Apple purchase guidelines](https://developer.apple.com/app-store/review/guidelines/).

Google explicitly permits consumption-only apps that let users access previously
purchased services without purchasing inside the app. Digital purchases offered
inside a Play-distributed app normally require Play Billing, subject to specific
regional programs and their conditions. Do not add Stripe links or alternative
payment flows as a shortcut. See [Google payments guidance](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en).

StoreKit/Google Play verification, restoration, renewal/refund handling and
server-backed entitlements are implemented in source and covered by isolated
tests. No real store purchase or notification delivery has been verified. The
purchase flags remain off until the external setup and store tests pass. Use the owner's **€1/month** intent when selecting
available local price points and deciding taxes; do not reuse historical
€3.99/month or yearly proposals. Apple paid sales additionally require its Paid
Apps Agreement and bank/tax information; see the
[App Store Connect workflow](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow).

Local productivity remains available without an online account. The implemented
online account/Pro policy requires a current recorded terms/privacy acceptance and
a self-declared age group of 16–17 or 18+. This is not verified age or a parental
authorization system. Store content ratings are a separate questionnaire; do not
select a child-directed audience solely because a rating may be 3+ or 4+.

### Store activation checklist

1. Use Android package **`com.solacepomodoro.myapp`** in the existing Google Play
   account and iOS bundle ID **`com.solace.pomodoro`** in the existing Apple
   account. Match each platform's server verification configuration. Create an Apple auto-renewable **one-month** Pro product and
   an active Google auto-renewing **P1M** base plan, with no trial/offer variants in
   the initial release. Configure the intended local price and display the actual
   localized store price. Do not assume an identifier containing “monthly” proves
   its billing duration.
2. Create the Apple In-App Purchase server API key and grant the Google service
   account the necessary app-scoped Play Developer API permissions, including the
   subscription read/catalog and acknowledgement operations. Keep private keys in
   server environment settings. Never paste them in chat or mobile public env.
3. Configure Apple **Server Notifications V2** at
   `/api/billing/native/webhooks/apple`. Configure a Google RTDN topic and an
   **authenticated OIDC push subscription** at
   `/api/billing/native/webhooks/google`. The exact push audience and sender
   service-account email must match server configuration. Grant the official
   `google-play-developer-notifications@system.gserviceaccount.com` Pub/Sub Publisher
   on the topic; restrict other publishers. Enable subscription **and voided
   purchase** notifications. See [Google setup](https://developer.android.com/google/play/billing/getting-ready)
   and [OIDC push validation](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
4. The reviewed native and legal-consent migrations are already applied and
   verified; do not rerun or reset them as a publication step. Native billing has
   an operator-controlled **sandbox** database binding. The
   service credential cannot change that binding. Match the server
   `NATIVE_BILLING_ENVIRONMENT`; a different mode fails closed. Production requires
   an explicit operator change with
   `configure_native_billing_environment('production')` and matching server config;
   stored sandbox grants then remain isolated from production.
5. Configure hourly `GET /api/billing/native/reconcile` with an exact
   `Authorization: Bearer <CRON_SECRET>` header and a secret of at least 32
   characters. Vercel Cron injects its configured `CRON_SECRET`. This recovers
   missed notifications; foreground native refresh also rechecks saved purchases.
   SQL requires store verification newer than 24 hours as well as an unexpired
   paid/grace period. Monitor failures and batch capacity before growth.
   The Pro hourly configuration is prepared separately in `deploy/vercel.pro.json`;
   do not activate it on the current Hobby deployment.
6. Test sandbox/license-tester purchase, cancellation, renewal, restore, expired
   and refunded access, interrupted verification and Google acknowledgement retry
   on signed installed builds. Google acknowledgement happens only after durable
   verification; its three-day deadline still applies. Test deleted-account receipt
   replay and confirm another account cannot claim the purchase. Only then enable
   production products and submission. These are pending external tests, not
   results established by mocked unit tests. See
   [Google subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
   and [Apple server library](https://github.com/apple/app-store-server-library-node).

| Server setting                                                     | Value to provide                                                                                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NATIVE_BILLING_ENVIRONMENT`                                       | `sandbox` for test; `production` only with the matching operator binding.                                                                                                                    |
| `NATIVE_LIVE_PURCHASES_ENABLED`                                    | Keep `false` until commercial hosting, complete launch information and the existing hosting/auth-email/launch-review attestations are confirmed. Sandbox testing does not require this flag. |
| `APPLE_IAP_ENABLED` / `GOOGLE_IAP_ENABLED`                         | Remain unset/`false` until that store is ready; literal `true` enables its configured path.                                                                                                  |
| `APPLE_IAP_PRODUCT_ID`, `APPLE_IAP_APP_ID`                         | Exact monthly product identifier and numeric Apple app ID.                                                                                                                                   |
| `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY` | Server API key identifiers and private signing key.                                                                                                                                          |
| `APPLE_IAP_ROOT_CERTIFICATES_BASE64`                               | Optional reviewed DER-root list; the official pinned Apple Root CA G3 is bundled. Arbitrary CAs are rejected.                                                                                |
| `GOOGLE_IAP_PRODUCT_ID`, `GOOGLE_IAP_BASE_PLAN_ID`                 | Exact subscription product and active monthly base-plan identifiers.                                                                                                                         |
| `GOOGLE_IAP_SERVICE_ACCOUNT_JSON`                                  | Server-only service-account credential JSON.                                                                                                                                                 |
| `GOOGLE_IAP_PUSH_AUDIENCE`, `GOOGLE_IAP_PUSH_SERVICE_ACCOUNT`      | Exact HTTPS OIDC audience and authenticated Pub/Sub sender email.                                                                                                                            |
| `CRON_SECRET`                                                      | Private scheduler secret, at least 32 characters.                                                                                                                                            |

Native account deletion does not cancel an Apple/Google subscription. Show store
subscription-management instructions before deletion; do not make deletion wait
until the paid period ends. Raw native purchase references are removed with the
account. Opaque receipt hashes and detached random account tokens remain to prevent
duplicate or cross-account claims; the final policy must disclose their purpose
and the owner's reviewed retention criterion. Do not call them anonymous or
promise universal immediate erasure. Stripe cancellation remains a separate flow.

The client reserves a durable purchase intent before opening a store dialog.
Stripe Checkout checks the same workspace fence. Explicit SDK user cancellation
releases that intent; unknown errors, pending approvals and failed verification
retain it. The 15-minute launch deadline never silently unlocks a potentially
pending charge. Restore can finish a paid/pending receipt and transfer the fence
to the verified subscription. An unresolved expired attempt remains blocked for
new purchases until it is safely resolved; an app crash before opening the store
can require support to check the store and cancel the abandoned intent. Do not
automatically retry the payment or promise that an expired deadline proves no
purchase exists. Pausing new production purchases leaves existing receipt
verification, restoration and signed notification processing available.

## Existing developer accounts, signing and testing

For the immediate Android step, follow [Google Play: first internal test](google-play-internal-test.md), using the existing signed AAB and the owner's existing Console account. It includes the exact proposed monthly product fields and keeps public production separate.

1. **Open the existing Apple and Play accounts** and complete only outstanding
   identity/contact/agreement tasks. For reference, Apple's standard program is
   **US$99/year**, with regional/local pricing; Google Play registration is
   **US$25 once**. These are published reference fees, not new charges authorized
   or initiated by this work. See [Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment)
   and [Play account setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
2. **Android:** the [signed AAB/APK](android-release.md#final-signed-candidate)
   are prepared and verified. Retain ownership and make an owner-controlled
   portable backup of the existing upload key; configure Play App Signing and
   perform authorized device QA without deleting the owner's debug installation
   or local data. A debug APK is not the Play release artifact. Current new-app
   submissions require API 36; this repository already targets 36. See
   [Android signing](https://developer.android.com/studio/publish/app-signing)
   and [Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
3. **Check the Play account's production-access tasks.** Personal accounts created
   after November 13, 2023 require at least **12 testers continuously opted into a
   closed test for 14 days**, then an application for production access. This is
   not automatic approval. New personal accounts may also have an owner-operated
   physical-device verification task; Google specifies a non-rooted Android 10+
   device. See [closed testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
   and [device verification](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en).
4. **iOS:** provide a suitable Mac/Xcode build environment or a deliberately
   configured macOS CI service, select the owner's Apple team, and create a signed
   archive for `com.solace.pomodoro`. Current uploads must be built with Xcode 26+
   and the required SDK; use the current supported release when building. Validate
   on an iPhone and through TestFlight. Windows-generated iOS source is not a
   verified iOS build. See [Apple upload requirements](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
   and [Xcode distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).
5. **Complete the store records** with final screenshots, supported-device
   evidence, accurate descriptions, audience/content questionnaires, privacy forms,
   export-compliance answers and reviewer access instructions. Review the final
   binary's SDKs/permissions against the data inventory. Verify the deployed
   final privacy, support and account-deletion content before entering the live
   URLs in the stores. Draft copy is in [store-listing.md](store-listing.md),
   remaining policy decisions in [privacy-review.md](privacy-review.md), and the
   pending hosting upgrade in [vercel-pro-upgrade.md](vercel-pro-upgrade.md).

Use console invitations or secure local signing workflows. Do not put store
passwords, signing keys, recovery codes or production secrets in this document.

## Provider facts to use when finalizing privacy disclosures

These are published provider practices, **not verified settings for every Solace
account**. Account/project deletion periods are different from deleting one Solace
user. A dashboard's log-access window does not establish erasure of every internal
copy. Record the actual plan, configured retention and applicable contracts before
promising a specific end-user deletion deadline.

| Provider     | Verified public facts and remaining check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**   | Hobby permits personal/non-commercial use. The standard DPA describes Pro/Enterprise processor services; verify the applicable arrangement before asserting coverage. Runtime log limits are Hobby 1 hour, Pro 1 day, Enterprise 3 days, or 30 days with Observability Plus. These limits do not cover every build/security record. Confirm Solace's team plan, configured logging and contract. Sources: [terms](https://vercel.com/legal/terms), [DPA](https://vercel.com/legal/dpa), [runtime logs](https://vercel.com/docs/logs/runtime).                                                                                                                                                                                                                                                                 |
| **Supabase** | Database/Auth/Storage and backups are hosted in the selected region. Account, support, telemetry and CDN processing can cross that region. The FAQ states customer data deletion within 30 days after **project deletion**, not after an app-user deletion. Pro/Team/Enterprise daily-backup access is 7/14/up to 30 days. Free-project internal backups must not be assumed absent. Confirm actual backups, logs, support access and recovery procedures. Sources: [residency/transfers](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq), [backups](https://supabase.com/docs/guides/platform/backups), [Free backup clarification](https://supabase.com/kb/troubleshooting/will-backups-be-accessible-from-the-dashboard-immediately-after-upgrading-to-a-paid-plan-hXY4rs). |
| **Resend**   | Standard DPA applies on account signup. Stored email/log data is in the US even when the sending domain uses an EU region. Published active-account email/log retention is 30 days on Free/Pro/Scale; backups persist 7 days. Remaining customer data is removed within 90 days after **Resend account termination**. Individual earlier-message removal requires contacting Resend. The provider cites SCCs and Data Privacy Framework participation for transfers. Source: [Resend GDPR details](https://resend.com/security/gdpr).                                                                                                                                                                                                                                                                         |

Vercel's October 19 terms use a broad content definition for optional model
training. Its official explanation identifies code, agent/v0 chats, build and
deployment telemetry/errors and aggregate traffic statistics, with sensitive
content redacted. It does **not** identify hosted Solace mood entries or database
records as training inputs. Do not make that inference. Hobby/trial Pro defaults
to participation; paid Pro defaults out. Record the actual **Team Settings → Data
Preferences** and applicable project preference. Opting out governs future
sharing, not previously shared material. See [Vercel's explanation and settings](https://vercel.com/changelog/updates-to-terms-of-service-march-2026).

For the final policy, distinguish live application records, provider logs,
rolling backups, recipient-delivered emails, support correspondence, billing
records and user-exported files. EU database hosting alone is not a guarantee of
EU-only processing. Provider transfer mechanisms do not replace the owner's
assessment or make an unsupported “no tracking,” “never reused,” “immediate
deletion everywhere” or “GDPR compliant” claim true.
