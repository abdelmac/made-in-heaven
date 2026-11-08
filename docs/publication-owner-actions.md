# Solace publication: remaining owner actions

Reviewed **October 28, 2026** against official provider and store documentation.
This is a publication handoff, not proof of store approval or finalized policies.
The web release is live at `www.solace-pomodoro.com`; its legal/privacy pages remain
provisional drafts with `noindex` metadata. Technical implementation and verification belong in
[store-readiness.md](store-readiness.md) and [mobile.md](mobile.md).

**November 4 RTDN configuration:** the owner returned a real Cloud Shell apply
result with `ok:true` and `configurationVerified:true` for the pinned Solace
resources in `ennearock-web`. This is owner-returned configuration evidence,
not an independent Google API read. The configuration result initially kept
`notificationDeliveryVerified:false`, `purchasesEnabled:false` and
`deploymentPerformed:false`. Cloud resource apply is complete according to
the returned result and does not need to be repeated. A subsequent production
request-metadata check found the owner's timed test notification accepted with
**HTTP 200 at 2026-11-04T00:24:33.713Z** on the deployed OIDC-gated handler.
Authenticated test delivery is verified at that boundary. The owner now confirms
that the same Google account used on the phone is listed under
**Play Console's License testing page**; this is owner-confirmed without
independent Console access. Licensed purchase/restore validation remains incomplete. The sandbox-only
Google setting is now enabled after the checks below; its matching deployment
is READY. Native live purchases remain disabled. The owner's first actual
attempt has no verified payment outcome; its expired server intent was
deliberately recovered under the guards below. The controlled retry shows only
a real payment method; the owner has confirmed the actual account is in the
selected/saved license-test list. Earlier Back/Cancel produced the explicit
cancelled message and verified cleanup. The latest full instrument list has no
test cards. Its literal cancellation message and normal cleanup are now
confirmed, followed by the completed cache-only Play refresh. The owner reports
no Billing Lab use. The owner subsequently reported **paying with a real card**.
That is not a licensed test success or live-activation consent. Further
purchases are paused. The owner explicitly authorized cancellation of renewal
and a refund; Google Console **Refunded — subscription revoked / renewal stopped**
is now owner-reported. Bank/card credit is not verified. Guarded residual server
intent cleanup succeeded with a separate readback; checkout stays paused for
the publisher/license-testing screenshot check below. No licensed test success
or entitlement is claimed.

**November 3 Play package correction:** the owner created the Solace app in Play
Console, whose upload validation explicitly requires `com.solace.pomodoro`.
Android is restored to that permanent package and its existing callback;
iOS keeps the same identity. The fresh signed **1.0.0/code2** rebuild and matching
backend update are verified. Production deployment
`dpl_NsdqKBb4Xx6DVYfNSYwdZk6ciBCz` is READY at `www.solace-pomodoro.com`; its
Linux Next.js build and TypeScript passed. All 26 mobile Chrome browser checks
passed against intercepted providers, and read-only live HTTP smoke checks
passed against the new deployment. Do not use the superseded October 29
`com.solacepomodoro.myapp` AAB or its ZIP for this record. Earlier artifacts and
the existing upload key are preserved. The original callback is already allowed,
so no hosted Auth mutation is needed. The October 29 three-entry allowlist and
READY deployment `dpl_GAXwpaUbV5xhKD1FGwhCuWGN33xP` remain historical evidence,
not proof of the corrected build's successful upload or backend rollout.

The owner subsequently reported a successful Play Console upload of the
corrected **1.0.0/code2** AAB. The result has not been independently inspected.
After sharing the tester link, the owner replied "success" following instructions
to install through Play and try signing in. This records owner-reported success
following those installation/sign-in instructions; no independent device
inspection or complete core-feature QA was performed. Rollout, tester enrollment
and installation remain independently unverified. No store purchase or public
publication is established. The next milestone is verified sandbox checkout
activation and the first license-tester purchase after the completed
credential handoff below.

The owner reported creating a Google payments profile. Profile verification,
linkage and approval have not been independently confirmed. License tester
enrollment is owner-confirmed separately; credential handoff evidence is recorded below.
No public legal or contact details are inferred from that report; the outstanding
publisher information below remains unchanged.

An owner-provided Play Console screenshot shows **Solace Pro**, product ID
**`solace_pro`**, base plan ID **`monthly`**, the French billing description
**"Mensuel, renouvellement automatique"**, state **"Actif"**, France availability
and an update dated November 3, 2026. The price is not visible. Preserve these
existing IDs. This screenshot establishes the visible catalog fields, not an
authenticated catalog API readback or a successful purchase. The later real
helper result verifies the catalog and credential handoff separately below.
The later request metadata verifies authenticated Google test delivery; real
purchase tests remain pending.

Production environment preparation is now verified on the exact Vercel project
`prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2`, team `hikmagitzs-projects`. Only five
previously missing settings were added:
`GOOGLE_IAP_PRODUCT_ID=solace_pro`, `GOOGLE_IAP_BASE_PLAN_ID=monthly`,
`NATIVE_BILLING_ENVIRONMENT=sandbox`,
`NATIVE_LIVE_PURCHASES_ENABLED=false` and `GOOGLE_IAP_ENABLED=false`.
All five values were independently read back by individual field ID after
metadata capture. The eight existing environment settings were not overwritten,
and no private credential fields were read. No deployment or purchase enablement
was performed in that preparation. The later credential apply did not deploy or
activate purchases. The later November 4 owner-returned Cloud Shell result
reports RTDN resource configuration verified; the later request metadata records
accepted authenticated test delivery. Play Console settings have not been
independently inspected.

The owner supplied Google Cloud project ID **`ennearock-web`**; full account/project
access has not been independently inspected. The project may
be shared with other applications. Use dedicated Solace service accounts and
topics; do not rename or delete unrelated resources.

The owner supplied billing service-account email
**`solace-play-billing@ennearock-web.iam.gserviceaccount.com`**. Record it as an
owner-confirmed identifier. A real credential helper apply result returned by
the owner now reports successful read-only Google catalog access and sensitive
Production credential upload. It matched `com.solace.pomodoro`, `solace_pro` and
`monthly`, confirmed an active monthly plan, and returned the France catalog
price EUR units `1`, nanos `0`. This is the catalog price, not independent proof
of the final tax-inclusive checkout total. The result reports
`credentialUploaded:true`, `credentialValueReadBack:false`,
`protectedMetadataUnchanged:true`, `purchasesEnabled:false` and
`deploymentPerformed:false`. No private key was included in the returned status.
An independent metadata-only Vercel read confirmed exactly one sensitive
Production-only credential setting exists; its value was not read. Separate
public-setting verification before sandbox activation confirmed both Google/live purchase flags were
`false` and the native environment remains `sandbox`.
Full Play permissions, acknowledgement, lifecycle notifications
and actual purchases remain unverified. Grant only required Solace app-scoped
permissions; live purchase permission remains `false`.

The owner explicitly confirmed the same phone Google account is listed under
**Play Console's License testing page**. This was owner-confirmed, without an
independent Console inspection. The owner subsequently compared the actual
purchasing account privately and confirms selected/saved license-list membership;
no account mismatch is established. Read-only hosted database inspection confirmed
the native billing binding remains **sandbox**, capability version 1 and the
required guarded/legal RPCs with service execution access. A guarded Vercel
update changed only Production `GOOGLE_IAP_ENABLED` from `false` to `true`.
Exact readback confirmed `NATIVE_BILLING_ENVIRONMENT=sandbox`,
`NATIVE_LIVE_PURCHASES_ENABLED=false` and the six other public identifiers;
protected metadata was unchanged and no private key was read. The 35 focused
configuration/receipt checks passed; the prior full source run remains
864 tests in 68 files with no source change for this activation.

Matching deployment **`dpl_F5ZgAiYHuW7uPFUYaBfCgq3Xtt8u`** is **READY** at
`solace-hikmagitz-hhgnu29m2-hikmagitzs-projects.vercel.app` and aliased to
**https://www.solace-pomodoro.com**. Its Next.js build and TypeScript passed.
Live HTTP checks passed all six public pages, signup marker/project/versions,
consent rejection (401), license notices and disabled Stripe checkout.
Unauthenticated native billing returned 401; Android CORS preflight returned 204
with the exact `https://localhost` origin; unsigned Google push returned 401.
No actual purchase was attempted by these checks. Google is enabled only against
the verified sandbox binding, with native live permission `false`. Commercial
launch, Stripe live checkout, hosting-plan upgrade and hourly cron activation
remain separate unchanged requirements.

**November 4 first purchase attempt:** after Google's purchase sheet opened,
the owner described confirmation waiting and was unsure which payment method
they selected. The exact original on-screen wording is not established. A
durable unresolved-intent notice in Solace is distinct from a confirmed Google
`PENDING` receipt, and the source of the reported wording has not been identified.
No code defect or provider outcome is established. A read-only database check found zero Google
sandbox subscriptions, zero acknowledgements and one unresolved sandbox intent
created at `2026-11-04T00:46:05.491755Z`, within the launch window at the initial check.
A later fresh aggregate check still found zero subscriptions/acknowledgements
and that one intent, now past its 15-minute launch window. It remained untouched
until the deliberate operator recovery below.
No Pro grant is claimed;
elapsed time alone does not prove that a pending provider purchase disappeared.

The owner now reports **Solace Pro is not listed in Google Play subscriptions**.
They also report an explicit **Restaurer mes achats** returned **no matching
purchase**, and the same Google account's **Play → Payments & subscriptions →
Budget & history** shows **no Solace order**. The owner also reports no November 4
order in developer **Play Console → Solace → Order management / Gestion des
commandes** with status filters cleared. These four absence checks do not prove
cancellation, no charge or a defect.

Following those checks, deliberate operator recovery succeeded for the exact
expired Google sandbox `solace_pro` intent created at
`2026-11-04T00:46:05.491755Z`, using the existing release RPC under the normal
billing lock. Environment/capability/legal-owner checks, zero purchase
bindings/subscriptions, Stripe-conflict guards and post-checks passed. The
result reports **sandbox true, unresolved intents 0, Google monthly subscriptions
0, acknowledgements 0**. This releases the server reservation; it is not an SDK
cancellation or automatic-expiry outcome and does not prove no charge.
No grant, credential, catalog or flag changed. Fresh public-setting verification
kept Google enabled, native environment `sandbox`, native live permission
`false`, product `solace_pro` and base plan `monthly`; no private credential was read.
Existing receipt recovery through startup/foreground or restore does not start
another SDK buy. Android receipt queries filter to the current Solace account,
so a no-matching-receipt result would not prove there is no Google order or that
it was cancelled. Server
verification and acknowledgement remain required before
Pro is verified. The owner initially saw a default real method, then explicitly
expanded the **full instrument list and found no test cards**. The test-purchase
notice and always-approves test card are not confirmed.
The owner has privately compared the actual billing account and confirms it is
already in the **selected and saved** account-level license tester list. Do not
infer an account mismatch. The page is **Manage account → Play apps settings →
Monetization settings → License testing**. See Google's
[license-testing instructions](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en)
and [billing test guidance](https://developer.android.com/google/play/billing/test).
The retry intent was created at `2026-11-04T01:30:31.204502Z`. After Back/Cancel,
the owner explicitly reported **"Achat annulé. Aucun nouvel accès n’a été activé."**
A fresh read-only database check confirmed the `sandbox` environment, zero
Google sandbox `solace_pro` intents, zero remaining rows for the exact retry,
zero subscriptions and zero acknowledgements. This verifies **normal
cancellation cleanup for this retry**, distinct from the first attempt's guarded
operator recovery. No code fix or deployment was needed. A completed purchase
or Pro grant is not established.

The owner reports cancelling the latest full-list check without buying. A later
snapshot still found one intent created at `2026-11-04T04:52:34.493294Z`
(**05:52 Paris time**), within its launch window at that check, with sandbox
binding and zero subscriptions/acknowledgements. That snapshot preceded the
literal cancellation confirmation. Fresh readback now confirms **sandbox,
intents 0, subscriptions 0, acknowledgements 0**; latest normal cancellation
cleanup is verified. No intent reset, code change or deployment was performed.

The owner confirmed the literal **"Achat annulé. Aucun nouvel accès n’a été
activé."** before closing Solace, then completed **Samsung Settings → Apps →
Google Play Store → Force stop → Storage → Clear cache only** and reopened Play
Store with the licensed account. Storage/app data were preserved. Google's
[cache instructions](https://support.google.com/googleplay/answer/14121800?hl=en)
document the cache action. The owner reports **Play Billing Lab is not installed
and has never been used**. A cache/licensing cause is not established, and no
post-cache test has yet shown that test cards returned. See Google's
[billing test guide](https://developer.android.com/google/play/billing/test).
The owner subsequently reported **"i paid with my real card"**. Do not record
that as a licensed test success or authorization for live payments. **Pause
further purchase instructions.** The pre-refund database snapshot found
`sandbox`, one current intent created at `2026-11-04T05:00:11.926248Z`
(**06:00 Paris time**), and zero Google subscriptions across all environments,
zero acknowledgements and zero grants. That intent remained held until the
owner's reported refund and guarded cleanup below; no Pro grant is established.

Safe request-metadata inspection for the last 30 minutes showed six Google
webhook POST 400 responses at **05:05:57.823Z–05:07:50.925Z** and two native
verification POST 400 responses at **05:06:04.664Z–05:06:11.864Z**; native billing
GETs returned 200. No response bodies, raw logs or private credentials were read.
Sandbox rejecting a real receipt is a possible explanation, but the exact 400
cause is unconfirmed.

The owner explicitly authorized cancellation/refund and subsequently reports
Google Console **"Refunded — subscription revoked / renewal stopped"**. Record
this as **owner-reported provider outcome**; there was no independent Google API
read, and bank/card credit is not verified. The earlier verification/restore
message was Solace UI rather than order evidence. Connected tools did not
perform the provider refund. Google's
[order/refund documentation](https://support.google.com/googleplay/android-developer/answer/2741495?hl=en)
describes those account actions.

After the owner-reported refund/revocation, operator cleanup succeeded for the
exact Google sandbox `solace_pro` intent created at
`2026-11-04T05:00:11.926248Z` through the existing guarded lease/release RPC
transaction. Sandbox/capability/legal-owner, exact sole row, no associated native
bindings/subscriptions across environments and Stripe-conflict guards, lock/rechecks
and post-verification passed. Post-commit checks and a separate read at
**05:16:05 UTC / 06:16 Paris** confirmed **sandbox, exact refunded attempt 0,
total Google sandbox intents 0, Google subscriptions across environments 0,
acknowledgements 0**. This is server-reservation cleanup, separate from Google's
owner-reported refund. No schema, credential, catalog, flag, entitlement or
deployment change occurred.

No further checkout. The next pending diagnostic is a **redacted screenshot of
account-level License testing under the same publisher that owns the refunded
Solace app/order**, showing the selected tester list and saved state, with
account addresses blurred. Cache-only refresh did not resolve the missing test
cards; Billing Lab was never used. The exact cause remains unestablished.
Passwords, receipts and purchase tokens stay on the phone.

### Manual real-card order resolution

The owner has now reported the refunded/revoked/renewal-stopped result. The
following procedure is retained as reference; do not repeat it for that order.

On a computer, open **Play Console → Manage account → Play apps order management
/ Gestion des commandes**. Privately search the payer's full email and select
only the latest Solace Pro order. If its status is **Processed**, choose a
**full refund and revoke**, enter an accurate reason and submit. If it is
pending, already refunded or the action is unavailable, report that status.
The final provider outcome is owner-reported refunded with renewal stopped;
bank/card credit remains unverified. The residual server intent was cleaned up
separately as recorded above. Further checkout remains paused.

One pending-to-purchased recovery regression was added in
`tests/native-purchases.test.ts`, covering no second SDK buy and required server
verification/acknowledgement. Its focused file passed **42 tests**; TypeScript,
scoped lint/formatting and diff checks passed. Only the test file changed, with
no runtime deployment. The earlier **864 tests / 68 files** full run predates
this regression; the new result is the focused 42-test file run.

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

The corrected signed Android AAB/APK candidate is built and verified, and the
November 3 full unit run passed **798 tests in 66 files**. Following the earlier
package mismatch error, the owner reported a successful upload of the corrected
code-2 AAB, then reported success following the Play installation/sign-in
instructions. No independent Console/device inspection or complete core-feature
QA is confirmed.
See [artifact records](android-release.md#final-signed-candidate).
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
| Complete native product verification and paid-app agreements.                      | The returned helper result verifies active monthly `solace_pro` / `monthly` and France EUR `1` catalog pricing. The final checkout total, Apple setup, merchant/tax/bank review, full API permissions and actual purchase tests remain pending.                                  |
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
tests. Authenticated Google test-notification delivery is now verified from
production request metadata; real purchases and lifecycle notification effects
remain unverified. The
production-purchase permission remains off until the external setup and store tests pass. Google's sandbox-only setting and matching deployment are verified as recorded above. Use the owner's **€1/month** intent when selecting
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

1. Use Android package **`com.solace.pomodoro`** in the existing Google Play
   account and iOS bundle ID **`com.solace.pomodoro`** in the existing Apple
   account. Match each platform's server verification configuration. Create or
   select the Apple auto-renewable **one-month** Pro product. Keep Google's
   existing **`solace_pro` / `monthly`** plan; the returned helper result confirms
   its active monthly **P1M** catalog duration. No
   trial/offer variants are intended for the initial release. Verify the intended
   local price and display the actual
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

### Secure Google credential handoff

The owner-confirmed billing verification account is
`solace-play-billing@ennearock-web.iam.gserviceaccount.com` in project
`ennearock-web`. It is separate from the dedicated Pub/Sub **OIDC push sender**
account covered by the November 4 owner-returned configuration result. Do not put the billing
account into `GOOGLE_IAP_PUSH_SERVICE_ACCOUNT` merely because it already exists.

In Google Cloud, select `ennearock-web`, open **IAM & Admin → Service Accounts**,
select the exact billing account, then **Keys → Add key → Create new key → JSON**.
Keep the downloaded file private and select it only through the local credential
helper; do not paste its contents into chat or a mobile/public environment file.
See [Google's service-account key instructions](https://docs.cloud.google.com/iam/docs/keys-create-delete).
Enable the Google Play Developer API and grant the required Solace app-scoped
billing permissions in Play Console as described by Google's
[API setup guide](https://developers.google.com/android-publisher/getting_started).
Providing the email alone does not verify those permissions.

The local handoff helpers, `scripts/setup-google-play-credential.ps1` and
`scripts/configure-google-play-credential.mjs`, are ready and reviewed. The owner
explicitly approved selection of the exact billing account's local JSON and
storage of only `GOOGLE_IAP_SERVICE_ACCOUNT_JSON` as a sensitive Production
secret in `solace-hikmagitz` / `hikmagitzs-projects`, while purchases remain
disabled.

The owner completed this local handoff and returned the successful helper status
recorded above. The command is retained for reference; do not repeat the upload
after success because it refuses an existing credential:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\setup-google-play-credential.ps1 -Apply
```

Omit `-Apply` for an offline preview without selecting or sending a credential.
Apply pins the exact service-account/project identifiers, checks the five
prepared settings above and verifies the Google catalog read-only for the
expected product/base plan, active state and `P1M` duration. It then adds only
the sensitive Production `GOOGLE_IAP_SERVICE_ACCOUNT_JSON` setting, using child
stdin, and refuses to replace an existing credential. It verifies the resulting
secret metadata and protected settings without reading private field contents.
The helper makes no extra key copy and does not print the key or put it in
command arguments, environment variables, Git or chat. The original downloaded
file remains under the owner's control. It does not deploy, enable purchases,
configure RTDN or change unrelated Google Cloud resources.

Preparation passed the full **840-test / 67-file** unit run, including **42
synthetic helper tests**. Those 42 tests passed again after final documentation
changes in the helper. TypeScript, scoped ESLint/formatting, Node/PowerShell
syntax and STA PowerShell/Node offline previews passed. The checks used no real
Google credential and made no credential network write. Separately, the owner
then ran the real apply and returned successful catalog/credential-upload status.
The private key was never returned in that result and was not read back. No
deployment or purchase activation is claimed. The final consumer checkout total,
actual purchase tests remain pending; license tester enrollment is now
owner-confirmed. Authenticated
Google test delivery is verified by the later production request metadata below.

### Authenticated Google RTDN preparation

The November 4 real Cloud Shell apply result returned by the owner reports
`configurationVerified:true` for project `ennearock-web` and these dedicated
Solace resources: topic `projects/ennearock-web/topics/solace-play-rtdn`, push
subscription `projects/ennearock-web/subscriptions/solace-play-rtdn-push` and
OIDC push account
`solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com`. That push account
is distinct from the existing billing verification account. These are
owner-returned resource checks, not an independent Google API read. The endpoint and exact
OIDC audience are both
`https://www.solace-pomodoro.com/api/billing/native/webhooks/google`.

The Cloud Shell helper `scripts/setup-google-play-notifications.sh` is ready
and reviewed. Its SHA-256 is
`95bfbe4d5c832c88fd9bd21207e6f3c74ea4094ce9e706306201e397b8e8e97f`.
The owner completed its real apply and returned the result above. The commands
are retained as implementation reference; no repeat apply or resource creation
is needed after this successful result. Only the `.sh` file belongs in Cloud
Shell, not the private billing JSON:

```bash
bash ~/setup-google-play-notifications.sh --preview
bash ~/setup-google-play-notifications.sh --apply
bash ~/setup-google-play-notifications.sh --verify
```

Preview is offline; verify is read-only. Apply uses an explicit `ennearock-web`
project on every `gcloud` command, enables the required IAM/Pub/Sub APIs if
missing, creates only the dedicated account/topic/subscription when absent and
adds the scoped IAM bindings needed for authenticated push. Existing
configuration mismatches cause refusal. Other policy bindings and unrelated
resources are preserved. The helper bounds new-account visibility checks and
does not retry writes, publish a message, deploy the app or enable purchases.
The Google billing credential JSON does not belong in this Cloud Shell upload.

Preparation passed **21 executable fake-cloud checks**, the full **864-test /
68-file** unit run, TypeScript, ESLint, formatting, Bash syntax and offline
preview checks. Those checks are not real Cloud Shell execution or delivery
evidence.

Only the two previously missing public Vercel Production push settings were
added and independently verified: `GOOGLE_IAP_PUSH_AUDIENCE` is the exact
webhook URL above, and `GOOGLE_IAP_PUSH_SERVICE_ACCOUNT` is
`solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com`. No existing field
was overwritten and no secret value was read. These prepared strings do not
create their referenced cloud resources.

Matching production deployment **`dpl_76CVw67TvqDDXK1XgK8gHx6xMuij`** is READY
and aliased to **https://www.solace-pomodoro.com**. Its Next.js build and
TypeScript passed. Live HTTP smoke checks passed all six public pages, exact
signup-readiness marker/project/versions, disabled Stripe checkout,
unauthenticated consent rejection (401) and published license notices. Unsigned
and invalid-Bearer Google webhook POSTs both returned 401; these negative checks
used no real token/purchase and did not read the credential.

The deployed handler can accept a Google-signed **test notification** with
purchases disabled, while retaining OIDC signature, sender, audience and package
validation. Test notifications do not invoke purchase verification or database
billing updates, and do not require reading the billing private key. This is
implemented/tested behavior, and the later production request metadata verifies
acceptance of the owner's timed authenticated test notification.

The owner-returned real apply reports `ok:true`, `configurationVerified:true`,
`notificationDeliveryVerified:false`, `purchasesEnabled:false` and
`deploymentPerformed:false`. Resource configuration has that returned evidence;
the later request-metadata result verifies authenticated test delivery. Preserve
unrelated resources in the shared project, keep native live purchases disabled, and
use the owner-confirmed license tester account for a test purchase. No repeat Cloud Shell
apply or test-message send is needed for the accepted delivery recorded below.
No hosting-plan upgrade or cron activation was
performed. Real purchase, acknowledgement and restore tests remain pending.

Before sandbox activation, November 4 read-only Vercel checks confirmed all five public values:
`GOOGLE_IAP_ENABLED=false`, `NATIVE_LIVE_PURCHASES_ENABLED=false`,
`NATIVE_BILLING_ENVIRONMENT=sandbox`, the exact webhook push audience and the
dedicated push account above. No private key was read and no setting was
written. The owner confirmed Play Console reported the notification sent.
A live unsigned webhook POST returned 401 at
**2026-11-04T00:19:25.350Z**. A later metadata-only log review found
**POST `/api/billing/native/webhooks/google` → HTTP 200 at
2026-11-04T00:24:33.713Z**, matching the owner's fresh test timing, on production
deployment **`dpl_76CVw67TvqDDXK1XgK8gHx6xMuij`** in project
**`prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2`**. The deployed OIDC-gated handler accepted
that notification, establishing authenticated test delivery at the endpoint.
Only request metadata was inspected; no headers, message bodies or private keys
were read or printed. This is not purchase, renewal, refund or restore proof.
License tester enrollment is now owner-confirmed. The first licensed attempt
has no verified purchase. The owner reports absent subscription, no matching
restore, no same-account history order and no developer Console order after
clearing filters. The exact expired sandbox server intent was deliberately
released under guarded operator recovery, leaving zero unresolved intents.
Absence and recovery do not establish cancellation or no charge. The
current setting is Google enabled in `sandbox` with native live permission
`false`. Use the
[first test-purchase guide](google-play-internal-test.md#first-license-tester-purchase-after-sandbox-activation)
with the verified READY sandbox deployment as a reference. The current owner
checkpoint returned only a real payment method. The owner must not confirm;
the actual billing account is owner-confirmed in the selected/saved account-level
license-test list. Back/Cancel returned the explicit cancelled/no-new-access
message, and fresh database readback verified cleanup for that preceding retry.
The newer full-list check found no test cards, but literal cancellation is now
owner-confirmed and fresh sandbox readback shows zero intents/subscriptions/
acknowledgements. The cache-only Play refresh is owner-completed and Billing Lab
was never used. No account mismatch or completed payment is established. The
owner subsequently reported paying with a real card. Pause further checkout
while license-testing configuration is checked. The owner reports Google Console
refunded/revoked/renewal stopped; bank/card credit is unverified. Guarded operator
cleanup and separate readback confirm zero residual Google sandbox intents,
Google subscriptions and acknowledgements. No live activation or licensed test
success is established. The next pending evidence is the redacted License
testing page under the same publisher owning Solace, showing selected/saved
tester configuration with addresses blurred.
The original flow requires the personal workspace, localized
store price, Google's test-purchase notice and **Test card, always approves**.
Stop if a real payment method appears. Any password/device verification stays on
the phone. App Pro status, restore, cancellation and renewal/refund behavior
still require actual test results.

| Server setting                                                     | Value to provide                                                                                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NATIVE_BILLING_ENVIRONMENT`                                       | `sandbox` for test; `production` only with the matching operator binding.                                                                                                                    |
| `NATIVE_LIVE_PURCHASES_ENABLED`                                    | Keep `false` until commercial hosting, complete launch information and the existing hosting/auth-email/launch-review attestations are confirmed. Sandbox testing does not require this flag. |
| `APPLE_IAP_ENABLED` / `GOOGLE_IAP_ENABLED`                         | Apple remains unset/`false`; Google is `true` for the verified sandbox environment and READY deployment. Native live purchase permission stays `false`.                                      |
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

For the immediate Android step, follow [Google Play: first internal test](google-play-internal-test.md), using the existing signed AAB and the owner's existing Console account. It includes the current monthly product fields and keeps public production separate.

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
