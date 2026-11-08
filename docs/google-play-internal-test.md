# Google Play: first internal test

Updated November 8, 2026. On November 3, Play Console explicitly required
**`com.solace.pomodoro`** for the owner's existing Solace app. Keep that permanent
Play identity. The October 29 `com.solacepomodoro.myapp` build was rejected for
this record and is superseded. The current signed candidate is **1.0.1/code3**,
with the inactive-receipt recovery protocol; use its export below.
Nothing in this document creates a store record, uploads a release, enrolls
testers or enables real payments.

**November 8, 2026 — current license-testing checkpoint:** Direct inspection of
the owner's French **Test de licence** screenshot shows the email-lists radio
selected and one list, **Google account used on your phone**, with **4 users**.
The list's row checkbox and header checkbox are **empty**;
**Enregistrer les modifications** is disabled, and the license response is
`RESPOND_NORMALLY`. The list exists but is not selected for license testing in
the shown state. This updates the earlier owner-reported selected/saved
enrollment below; the image does not verify addresses, purchasing-account
membership or publisher ownership.

The owner now reports **ticking the list's row checkbox, saving, reloading and
confirming it remains checked**. This correction is owner-confirmed; no updated
screenshot or independent Console/API verification is available. Google's
[license-testing instructions](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en)
require choosing the tester list and saving changes.

November 8 read-only prechecks confirm **sandbox**, **0 unresolved Google sandbox
`solace_pro` intents, 0 Google subscriptions across environments and 0
acknowledgements**. Public Vercel values match `NATIVE_BILLING_ENVIRONMENT=sandbox`,
`NATIVE_LIVE_PURCHASES_ENABLED=false`, `GOOGLE_IAP_ENABLED=true`, `solace_pro` and
`monthly`. No private credential was read; no configuration, deployment, schema
or entitlement changed.

The subsequent direct screenshot shows **Subscribe disabled**, Refresh/Restore
enabled and **"Un achat reste à finaliser..."**. This identifies unfinished receipt
recovery, rather than the durable-intent/busy state. Fresh read-only counts remain
**sandbox, 0 unresolved Google sandbox intents, 0 Google subscriptions across
environments and 0 acknowledgements**. Request metadata shows two native billing
GET 200 responses at **20:50:52.753–20:51:00.741 UTC**, and two verification POST
400 responses at **20:50:57.718–20:51:03.927 UTC**; the cause was unknown at that check.

A privacy-limited diagnostic emits the fixed event
`native_purchase_verification_failed` with only an allowlisted reason code and
numeric status. Five owner/restore requests at **21:03:41–21:05:02 UTC** confirmed
**`environment_mismatch` / 400**: a non-test Google receipt reached sandbox.
The operator has not independently read its current inactive Google state.

The backend and new Android client now support a strict inactive-receipt result:
only a current Google v2 **EXPIRED** receipt owned by the current account, with
one configured monthly product/base plan, a past RFC3339 expiry, no linked
purchase token and no offer qualifies. Sandbox may inspect an expired production
receipt and return `verified:false`, `resolved:true`,
`resolution:inactive_purchase`, `entitlementGranted:false` and the actual
acknowledgement state, without a production database write, acknowledgement or
grant. Same-environment terminal persistence follows the normal path and releases
no intent. Pending, active and unknown receipts remain blocked; iOS, normal
strict verification and RTDN behavior are unchanged.

Final deployment **`dpl_5SaET5RWbmsnhrqkN9dvfzg65tfx`** is **READY** at
**https://www.solace-pomodoro.com**. The **947-test / 69-file** regression run,
TypeScript, ESLint, Prettier and independent review passed, as did the cloud
Next.js **16.4.3** build/TypeScript. Post-deploy checks passed: home/prices 200
with web checkout disabled, invalid verification 400, unauthenticated verification
401, Android preflight 204 with exact `https://localhost`, and unsigned Google
push 401. Fresh readbacks retain the five public sandbox settings above and
**0 Google sandbox intents, 0 Google subscriptions across environments and 0
acknowledgements**; no private credential was read.

The signed **1.0.1/code3** AAB contains the new protocol and preserves the upload
certificate and callback; it is **not submitted**. The existing **1.0.0/code2**
client cannot understand that result. The owner must upload code 3 to the
**existing internal track**, update Solace through Play, then **Restore once,
without buying**, and report whether the warning clears and Subscribe enables.
Phone validation, test-card availability and a licensed purchase remain pending;
paid launch remains deferred.

The owner subsequently reported that the corrected **1.0.0/code2** AAB upload
succeeded in Play Console. This is owner-reported and has not been independently
inspected. Preserve that historical upload; do not upload code 2 again. The
current code-3 candidate above is required for the new recovery protocol.

The owner shared this tester opt-in link:
[Solace internal test](https://play.google.com/apps/internaltest/4699536051124956916).
Link sharing is confirmed, but browsing could not access it. The owner then
replied "success" after instructions to install through that link and try
signing in. This is recorded as owner-reported success following those
installation/sign-in instructions; no independent device inspection or complete
core-feature QA was performed. Internal rollout, enrollment and installation
remain independently unverified. No public publication or successful purchase
is established.

The owner also reported creating a Google payments profile. Its verification,
linkage to the Play app and approval have not been independently confirmed.
This report alone does not confirm license tester enrollment or supply verified
public legal/contact details. Credential handoff evidence is recorded separately
below.

An owner-provided Play Console screenshot now shows **Solace Pro**, product ID
**`solace_pro`**, base plan **`monthly`**, with **"Mensuel, renouvellement
automatique"**, state **"Actif"**, France availability and an update dated
November 3, 2026. The price is not visible in that screenshot. These are visible
Console fields; the later helper result adds catalog API evidence below. Neither
result establishes a successful purchase.

Five previously missing Production environment settings were prepared on
November 3 and independently verified on Vercel project
`prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2` / team `hikmagitzs-projects`:

| Setting                         | Initial preparation value |
| ------------------------------- | ------------------------- |
| `GOOGLE_IAP_PRODUCT_ID`         | `solace_pro`              |
| `GOOGLE_IAP_BASE_PLAN_ID`       | `monthly`                 |
| `NATIVE_BILLING_ENVIRONMENT`    | `sandbox`                 |
| `NATIVE_LIVE_PURCHASES_ENABLED` | `false`                   |
| `GOOGLE_IAP_ENABLED`            | `false`                   |

Only those missing fields were added; the eight existing environment settings
were not overwritten. Verification used individual field-ID reads and read no
private credential fields. This preparation performed no deployment and enabled
no purchases. The later credential upload did not deploy or activate this setup;
RTDN resource configuration is now covered by the November 4 owner-returned
result below, followed by accepted authenticated test delivery recorded below.

The owner supplied Google Cloud project ID **`ennearock-web`**. Full account and
project access have not been independently inspected. This
project may be shared, so use dedicated Solace service accounts/topics without
renaming or deleting unrelated resources.

The owner supplied the exact billing service-account email
**`solace-play-billing@ennearock-web.iam.gserviceaccount.com`**. That is an
owner-confirmed identifier. Grant only the required **Solace app-scoped** Play
permissions. The owner returned a successful real apply result from the reviewed
local credential helper. It reports:

- The pinned project/account and `com.solace.pomodoro` / `solace_pro` / `monthly`
  matched; read-only Google catalog verification confirmed an active monthly plan.
- The France catalog price is EUR, units `1`, nanos `0`. This is a catalog API
  value, not independent proof of the final tax-inclusive consumer checkout total.
- `credentialUploaded:true` stored `GOOGLE_IAP_SERVICE_ACCOUNT_JSON` as a
  sensitive Production Vercel setting; `credentialValueReadBack:false` and
  `protectedMetadataUnchanged:true` were reported.
- `purchasesEnabled:false` and `deploymentPerformed:false` remained in effect.

This is owner-returned helper evidence; the private credential was not pasted
into chat or read back. A separate Vercel metadata-only read confirmed exactly
one sensitive Production-only credential setting exists, without reading its
value. Independent public-setting checks confirmed `GOOGLE_IAP_ENABLED=false`,
`NATIVE_LIVE_PURCHASES_ENABLED=false` and `NATIVE_BILLING_ENVIRONMENT=sandbox`.
Do not repeat the completed upload: the helper refuses an existing credential. See the
[secure handoff details](publication-owner-actions.md#secure-google-credential-handoff).
On November 4, the owner returned a real Cloud Shell apply result with
`ok:true` and `configurationVerified:true` for project `ennearock-web`, topic
`projects/ennearock-web/topics/solace-play-rtdn`, subscription
`projects/ennearock-web/subscriptions/solace-play-rtdn-push` and push account
`solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com`. Its endpoint and
OIDC audience both match
`https://www.solace-pomodoro.com/api/billing/native/webhooks/google`.
This is owner-returned resource-configuration evidence, not an independent
Google API read. The result reports `notificationDeliveryVerified:false`,
`purchasesEnabled:false` and `deploymentPerformed:false`. The completed apply
does not need to be repeated.

Authenticated test delivery is now verified from production request metadata;
see the
[RTDN instructions](publication-owner-actions.md#authenticated-google-rtdn-preparation).
The owner has now confirmed that the same Google account used on the test phone
is listed on **Play Console's License testing page**. This is
owner-confirmed enrollment, without independent Console access. Real
purchase/restore tests remain pending. Catalog access does not establish acknowledgement permissions or a
successful subscription purchase.

The matching notification backend deployment
`dpl_76CVw67TvqDDXK1XgK8gHx6xMuij` is READY at
`https://www.solace-pomodoro.com`; its build, TypeScript and read-only public HTTP
checks passed. Unsigned and invalid-Bearer webhook requests both returned 401.
The owner confirmed Play Console reported the notification sent.
At **2026-11-04T00:24:33.713Z** (**01:24 Paris time**), production request metadata recorded
**POST `/api/billing/native/webhooks/google` → HTTP 200** on that deployment,
matching the owner's fresh test timing. The deployed OIDC-gated handler accepted
the authenticated notification. This verifies the test delivery path; it does
not verify a purchase, renewal, refund or restore. Purchases were last verified
disabled.

Before sandbox activation on November 4, read-only Vercel checks confirmed both purchase flags `false`,
the `sandbox` environment and the exact prepared push audience/account. No
private key was read and no setting was written. A live unsigned webhook POST
returned 401 at **2026-11-04T00:19:25.350Z**. An initial request-metadata review
showed only that negative check; the later review found the accepted 200 above.
Only request metadata was inspected: no headers, message bodies or private keys
were read or printed.

The sandbox-only activation setting is now verified: after a read-only check
confirmed the hosted database remains bound to **sandbox**, only Production
`GOOGLE_IAP_ENABLED` changed from `false` to `true`. Readback confirmed
`NATIVE_BILLING_ENVIRONMENT=sandbox`, `NATIVE_LIVE_PURCHASES_ENABLED=false` and
the six other public identifiers; protected setting metadata stayed unchanged
and no private key was read. The 35 focused configuration/receipt checks passed.
Matching deployment **`dpl_F5ZgAiYHuW7uPFUYaBfCgq3Xtt8u`** is **READY** and
aliased to **https://www.solace-pomodoro.com**; its Next.js build and TypeScript
passed. Live checks passed all six public pages, signup readiness, consent 401,
license notices and disabled Stripe checkout. Unauthenticated native billing
returned 401, Android CORS preflight returned 204 with the exact
`https://localhost` origin, and unsigned Google push returned 401. The first
actual licensed attempt has no verified purchase; its expired server intent was
deliberately recovered as recorded below. The owner cancelled the controlled
retry and normal intent cleanup was verified for that earlier retry. A later
full-list inspection found no test cards. The owner then confirmed the literal
cancellation message, cache-only Play refresh and no Billing Lab use; fresh
readback verified that cancellation's cleanup. The owner then reported paying
with a real card. This is not a licensed test success or approval for live
activation. The owner now reports Google Console **Refunded — subscription
revoked / renewal stopped**; bank/card credit is not verified. Guarded residual
intent cleanup succeeded and was read back separately. Further checkout stays
paused for the publisher/license-testing screenshot check below. No purchase was attempted by these deployment checks. Native live checkout, hosting upgrade and cron
activation remain unchanged.

## Select the existing app or create its record

Open the existing [Play Console account](https://play.google.com/console).
If Solace already exists, use that record and preserve its existing package and
product identifiers. Otherwise create its app record with these values:

| Field                        | Value                               |
| ---------------------------- | ----------------------------------- |
| App name                     | Solace                              |
| Default language             | French, France (`fr-FR`)            |
| Type                         | App                                 |
| Download price               | Free; Pro is an in-app subscription |
| Android package in the build | `com.solace.pomodoro`               |
| Support email                | `quetzal.hkm@gmail.com`             |

App records and account verification belong to the owner's existing account.
Do not register another developer account or pay the enrollment fee again.
Google's [app setup instructions](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
describe the fields and permanent identifiers.

## Prepare the internal release

Go to **Test and release → Testing → Internal testing → Create new release**.
Configure Play App Signing when prompted. Select the matching signed
**AAB**:

```text
C:\project\pomodoro\web\made-in-heaven\.local\exports\solace-com.solace.pomodoro-1.0.1-3-signed.aab
```

The actual package/callback/signatures and bundled recovery protocol were
verified on November 8; this candidate has not been submitted. See the
[current verification record](android-release.md#final-signed-candidate) for
hashes and build metadata. The October 29 package-specific AAB and preparation ZIP contain
`com.solacepomodoro.myapp` and must not be used for this Play record. The older
`.local/exports/solace-1.0.0-1-signed.aab` has the correct package but code 1; keep
it and the owner-reported uploaded code-2 build as historical artifacts. Use
the new code-3 candidate for the recovery update.

Its verified package is `com.solace.pomodoro`, version **1.0.1**, version code **3**.
Never re-upload an already used version code. The source
and release-build instructions are in [android-release.md](android-release.md).
Preserve the existing upload identity and complete its owner-controlled portable
backup before relying on it for future uploads. No private signing key belongs
in the store-assets ZIP or a chat message.

Suggested release name: `1.0.1 (3) — Internal test`.
Suggested French notes:

> Correction de la récupération des anciens achats inactifs.
> Vérification de la restauration des achats, sans nouvel achat.

The console upload can first be saved as a draft for review. A Billing-enabled
version must actually be published to a track, including internal testing,
before Google's billing-product features become available. An unpublished draft
does not meet that requirement. Use the owner's intended internal tester list;
internal distribution is separate from public production rollout. See
[Billing setup](https://developer.android.com/google/play/billing/getting-ready)
and [internal testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

The Android package again matches the owner's existing `com.solace.pomodoro`
debug app, but a release/Play signing certificate can differ from its debug
certificate. Do not uninstall that app or discard its local data to resolve a
signature conflict. Use an owner-approved separate test device/profile or arrange
a verified data-preserving handoff. The authentication callback is
`com.solace.pomodoro://auth/callback`, already present in the hosted allowlist
for iOS and the earlier Android installation. This correction needs no new
hosted Auth settings or email requests.

## Use the existing monthly Pro subscription

Under **Monetize with Play → Products → Subscriptions**, keep the existing
product/base plan shown in the owner's screenshot. Do not create duplicate IDs.
The visible record and remaining price check are:

| Field                 | Visible value or remaining check                                             |
| --------------------- | ---------------------------------------------------------------------------- |
| Product name          | Solace Pro                                                                   |
| Product ID            | `solace_pro`                                                                 |
| Base plan ID          | `monthly`                                                                    |
| Plan type             | Auto-renewing, visible in the screenshot                                     |
| Billing period        | Monthly (`P1M`), confirmed by the returned helper catalog result             |
| State / availability  | Active / France, visible in the screenshot                                   |
| Trial / special offer | None intended for this release; not independently verified                   |
| France catalog price  | Helper API result: EUR units `1`, nanos `0`; final checkout total unverified |

Product/base-plan IDs are permanent. Existing IDs should be supplied instead of
creating duplicates. Bulk price entry is tax-exclusive and can result in tax or
local price adjustments; entering `1 EUR` there does not by itself prove the
final customer price. The helper later returned France's EUR `1` catalog price;
review the final French consumer total before purchase testing. The
payments profile and any requested merchant details must be completed in the
owner's account. See [Google subscription setup](https://support.google.com/googleplay/android-developer/answer/140504?hl=en).

## Before a test purchase

- The [secure Google credential handoff](publication-owner-actions.md#secure-google-credential-handoff)
  returned successful owner-supplied apply evidence; do not re-upload the key.
  The billing verification
  service account above is separate from the dedicated Pub/Sub OIDC push
  account covered by the November 4 owner-returned configuration result.
- The owner privately compared the actual purchasing Google account and confirms
  it is in a **selected, saved** account-level license tester list. No account
  mismatch is established. The owner has now expanded the full payment-method
  list and reported no test cards before the cache refresh; use only the
  conditional post-cache attempt described below.
  Internal-test access alone does not establish license enrollment.
  Confirm the purchase sheet shows a test purchase and select
  **Test card, always approves**.
- Configure the Google verification credentials, product/base plan and signed
  RTDN push identity on Solace's server using the secure settings in
  [publication-owner-actions.md](publication-owner-actions.md). Product IDs are
  nonsecret; the service-account private key belongs only in server secrets.
- Keep the database/environment in sandbox and production-purchase permission
  closed. Test purchase, acknowledgement, restore, renewal, cancellation and
  refund before considering production sales.

See [license testing](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en)
and [Billing test methods](https://developer.android.com/google/play/billing/test).
Publisher/trader details, policy review and the deferred Vercel Pro upgrade remain
separate public paid-launch requirements. Neither an internal build nor a test
purchase establishes store approval.

## First license-tester purchase after sandbox activation

The sandbox deployment is verified READY. The owner opened Google's purchase
sheet and described confirmation waiting after initially reporting an error.
The exact original on-screen wording and selected payment method are not
established. A durable unresolved-intent notice in Solace is distinct from a
confirmed Google `PENDING` receipt; neither source has been identified for the
reported wording. No completed, cancelled or failed payment, code defect or Pro
grant is established.

The initial read-only database check found **zero Google sandbox subscriptions**,
**zero acknowledgements** and **one unresolved sandbox intent**, created at
`2026-11-04T00:46:05.491755Z`. It was within its launch window at that check;
an elapsed launch deadline would not establish a provider payment outcome.
The attempt was preserved while its outcome was investigated. A later fresh aggregate check still found zero subscriptions,
zero acknowledgements and that one intent, now past its 15-minute launch window.
The intent remained untouched until the deliberate operator recovery below.

The owner now reports **Solace Pro is not listed in Google Play's subscriptions**.
They also returned these follow-up results:

- Explicit **Restaurer mes achats** in Solace: **no matching purchase**.
- Same-account **Google Play → Payments & subscriptions → Budget & history**:
  **no Solace order** reported.
- Developer **Play Console → Solace → Order management / Gestion des commandes**,
  with status filters cleared: **no November 4 order** reported.

These owner-reported absences do not prove cancellation, no charge or a code
defect. Together with the fresh database guards, they formed the basis for a
deliberate operator recovery of the exact expired Google sandbox `solace_pro`
intent created at `2026-11-04T00:46:05.491755Z`.

The existing release RPC succeeded under the normal billing lock, with
environment/capability/legal-owner checks, zero native bindings/subscriptions,
Stripe-conflict checks and post-verification. Its result was **sandbox true,
unresolved intents 0, Google monthly subscriptions 0, acknowledgements 0**.
This releases Solace's server reservation; it is not an SDK cancellation or
automatic-expiry outcome, and does not prove no Google charge. No Pro grant,
credential, catalog or flag change occurred. Fresh public-setting readback kept
Google enabled, `sandbox`, native live permission `false`, `solace_pro` and
`monthly`.

Existing receipt recovery through startup/foreground or restore does not start
another purchase. Android restore filters receipts to the current Solace account;
a no-matching-receipt result does not prove there is no Google order. Server
verification and acknowledgement remain required before Pro is verified.
The owner initially reported only a default real payment method, then explicitly
expanded the **full instrument list and found no test cards**.
Google's test notice and **Test card, always approves** are not confirmed.
**Do not confirm the purchase.** The owner privately compared the actual billing
account and confirms it is already in the **selected and saved** account-level
license tester list; do not infer an account mismatch. The relevant page is
**Play Console → Manage account → Play apps settings → Monetization settings →
License testing**. See Google's
[license setup](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en)
and [billing test guide](https://developer.android.com/google/play/billing/test).
The prior snapshot found one retry intent created at
`2026-11-04T01:30:31.204502Z`. After Back/Cancel, the owner explicitly reported
**"Achat annulé. Aucun nouvel accès n’a été activé."** A fresh read-only database
check confirmed `sandbox`, **zero Google sandbox `solace_pro` intents**, zero
remaining rows for that exact retry, zero subscriptions and zero acknowledgements.
This verifies **normal cancellation cleanup for the retry**, separately from
the first attempt's deliberate operator recovery. No code fix or deployment
was needed; no Pro grant or completed purchase is claimed.

For the latest full-list check, the owner reports cancelling without buying.
One subsequent database snapshot still found an intent created at
`2026-11-04T04:52:34.493294Z` (**05:52 Paris time**), within its launch window
at that check, with `sandbox`, zero subscriptions and zero acknowledgements.
That snapshot preceded the owner's literal cancellation confirmation. A later
fresh read confirmed **sandbox, intents 0, subscriptions 0, acknowledgements 0**,
verifying the latest cancellation cleanup. No intent reset, code change or
deployment was performed.

The owner confirmed waiting for **"Achat annulé. Aucun nouvel accès n’a été
activé."** before closing Solace, then completed **Samsung Settings → Apps →
Google Play Store → Force stop → Storage → Clear cache only** and reopened Play
Store with the licensed account. This was a cache-only refresh. See Google's
[Play Store cache instructions](https://support.google.com/googleplay/answer/14121800?hl=en).
The owner reports Play Billing Lab is not installed and has never been used.
A cache/licensing cause is not established, and the refresh has not yet been
shown to restore test cards. See the [billing test guide](https://developer.android.com/google/play/billing/test).
The owner subsequently reported **"i paid with my real card"**. This is not a
verified licensed test purchase, and does not authorize live activation.
**Pause further checkout.** The pre-refund database snapshot showed `sandbox`,
one intent created at `2026-11-04T05:00:11.926248Z` (**06:00 Paris time**), and
**zero Google subscriptions across environments, acknowledgements and grants**.
That intent was held until the owner's refund outcome and guarded cleanup
below; no Pro grant is established.

In the inspected 30-minute window, request metadata showed six Google webhook
POSTs returning 400 (**05:05:57.823Z–05:07:50.925Z**) and two native verification
POSTs returning 400 (**05:06:04.664Z–05:06:11.864Z**), with native billing GETs
returning 200. Bodies, raw logs and private credentials were not read. A real
receipt reaching sandbox verification is a possible explanation, but these 400
statuses do not establish the exact cause.

The owner authorized cancellation/refund and now reports Google Console
**"Refunded — subscription revoked / renewal stopped"**. This provider outcome
is **owner-reported**, not an independent Google API read; bank/card credit is
not verified. The earlier Solace verification/restore message was not order
evidence. Connected tools did not execute the provider refund. See Google's
[order and refund guidance](https://support.google.com/googleplay/android-developer/answer/2741495?hl=en).
After that report, deliberate operator cleanup succeeded for the exact Google
sandbox `solace_pro` intent created at `2026-11-04T05:00:11.926248Z`, through the
existing guarded lease/release RPC transaction. Environment/capability/legal-owner,
exact-row, no associated native binding/subscription across environments and
Stripe-conflict guards passed. Post-commit verification and a separate read at
**05:16:05 UTC / 06:16 Paris** confirmed **sandbox, exact attempt 0, total Google
sandbox intents 0, Google subscriptions across environments 0, acknowledgements 0**.
This server-reservation cleanup is separate from the owner's Google refund;
no schema, credential, catalog, flag, entitlement or deployment change occurred.

No more checkout. The next diagnostic is a **redacted account-level License
testing page screenshot under the same publisher account that owns the refunded
Solace app/order**, showing the selected tester list and saved state, with
account addresses blurred. That evidence remains pending. Cache-only refresh
did not resolve the test-card issue, and Billing Lab was not used; no account
mismatch or precise underlying cause is established.
Report only visible status or an app
error; passwords, receipts and tokens remain private on the phone.

One regression was added for pending-to-purchased recovery without a second SDK
buy call, requiring server verification/acknowledgement. The focused
`tests/native-purchases.test.ts` run passed **42 tests**, with TypeScript,
scoped lint, formatting and diff checks passing. Only a test file changed; no
runtime deployment was needed. The prior **864-test** full run predates this
regression; the new result is the focused 42-test file run.

The first-purchase flow below is retained only as reference. **Do not perform
another purchase while license-testing configuration is being assessed.**

1. Reopen or refresh the Play-installed Solace build with the enrolled Google
   account active in Play, sign into Solace and select your **personal workspace**.
2. Open **Offres et facturation → S'abonner à Pro**, select the monthly Solace Pro plan and inspect the localized
   store price. The catalog reports EUR 1 for France; confirm the displayed
   amount in the purchase sheet.
3. Expand the full payment-method list. Continue only when Google's sheet shows
   an explicit **test/no-charge notice** and **Test card, always approves is
   selected**. Otherwise cancel without buying and wait for **Achat annulé**.
4. If both conditions hold, confirm **one** test purchase on the phone and keep
   Solace open for 30 seconds. Enter any account password or device
   verification only on that phone; do not send it to chat.
5. Wait for server verification, then report whether Solace shows active Pro or
   an error. No order token, receipt or password is needed in the report.

After the first verified purchase, separately test app restart/restore,
cancellation and renewal behavior, then refund/expiry handling. Those later
checks remain pending and are not established by opening Google's purchase sheet.
