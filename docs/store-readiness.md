# Privacy, deletion and store handoff

Reviewed October 28, 2026. This records implemented source, hosted database changes and the verified web deployment. It is not a store submission or legal approval. Deployment `dpl_5rZpwJ1FMNsFr1hbRhimSGbwBtkr` is READY and aliased to `www.solace-pomodoro.com`. The owner supplied legal publisher **Machta Abdelkader**, nickname **ennearock**, country **France**, and support **quetzal.hkm@gmail.com**. These public fields are configured and visible live; identity and support-inbox receipt have not been independently verified.

The chosen audience is **all ages for local tools; self-declared 16+ for online accounts and Pro**. The neutral age choice is not identity verification or verified parental consent. The native catalog target is **€1/month for personal Pro** on Apple and Google. Products, localized prices and real store transactions remain unconfigured/unverified; the client displays the store's actual localized monthly price.

## Ready in source and database

- First-party `/privacy`, `/terms` and `/legal` bodies describe the actual product and outstanding policy decisions. `/support` uses the configured contact. They are deployed, with provisional `noindex` metadata, and remain review-ready drafts until [privacy-review.md](privacy-review.md) is completed.
- `/account-deletion` is public without login. Its `/?account=delete` button opens the browser account flow, including after uninstalling the app. Signed-out users sign in first; the link never submits deletion. The in-app path is **Paramètres → Compte → Supprimer le compte**, with current-password confirmation and exact `DELETE` text.
- The deletion API validates the user, origin/native transport and a password-authentication claim from the requesting session within ten minutes. Attempts are rate limited. Organization owners must transfer ownership first. Global session revocation precedes hard account deletion; issued access tokens expire normally, while protected routes also validate the user online.
- Personal web Stripe subscriptions are canceled immediately and open Checkout sessions closed before account removal, without automatic refund. Billing identity, environment and cancellation are checked under a lock; uncertain conditions stop deletion. A later failure can occur after Stripe cancellation. **Apple/Google renewal must be stopped separately in the store**; an active store subscription does not prevent immediate account deletion.
- Personal content, profile, memberships, private preferences and active timers are removed. The scrub removes attributable shared contributions from rows and authoritative JSON, detaches references, clears assignments and prevents stale sync from restoring them. Shared subjects/projects/tasks without author metadata remain organization resources; other members' content remains. Client caches/session are cleared after success. Exports and independent device copies require separate removal.
- Signup and the legacy-account acceptance panel request an eligible age declaration and acceptance of terms/privacy version `2026-10-28`. Server-recorded acceptance, not editable metadata or an existing login, gates native billing eligibility. The hosted signup-validation Auth hook is **enabled and independently verified** at `pg-functions://postgres/public/folia_before_user_created`. End-to-end signup/email QA remains an owner task.

| Migration                                     | Confirmed hosted state                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| `20260924215000_private_mood_preferences.sql` | Applied; private mood/preferences separation present            |
| `20261028214004_account_deletion_privacy.sql` | Applied; deletion capability version 1 confirmed                |
| `20261028221504_native_store_billing.sql`     | Applied; native capability version 1 and sandbox mode confirmed |
| `20261028222222_account_legal_acceptance.sql` | Applied; history aligned with source                            |

Hosted readback confirmed RLS on all six new native/legal tables, denied anonymous/client access to privileged RPCs, allowed intended service RPCs, denied service reconfiguration of native mode, and restricted signup-hook execution to the Auth role. These checks are not destructive hosted deletion or real store transaction tests.

Hook preview/apply/independent verification succeeded with only the two declared hook fields and one Auth configuration write. Protected Auth snapshots, including SMTP and redirects, were unchanged; independent verification made no writes. Direct hosted pure-function checks accepted 16–17/adult declarations and rejected under-16, missing and unaccepted declarations. A dry browser check of the deployed UI confirmed the neutral age choice, no identity form for under-16s, and explicit legal checkbox. Those checks created no account and sent no email. See [signup-hook record](account-signup-hook.md).

## Web and native subscriptions

Web billing uses Stripe. Native billing uses `@capgo/native-purchases` 8.9.6 with StoreKit 2 / Google Play Billing, server-side Apple/Google verification and separate store records. Native screens do not open Stripe Checkout. Native Pro is restricted to the connected owner of a personal workspace; organization purchases are not offered by this adapter.

The client reserves a durable server purchase intent before opening the store sheet. Existing native/Stripe purchases, pending web Checkout or unresolved native intents prevent another charge. Expiry does not clear an uncertain attempt: recovery/restore or support resolution is required. Only explicit store cancellation releases a reservation. Signed iOS transactions or Android purchase tokens go to the server; the client grants no local Pro. Android acknowledgement follows durable server persistence; iOS finishing follows server confirmation. Startup/foreground recovery, Restore and Manage are implemented. Native grants require provider verification within 24 hours; real notification/reconciliation delivery remains to be validated.

Production purchases require configured products/credentials, the HTTPS deployment, final launch documents, commercial hosting and email/launch attestations. The hosted database currently uses **sandbox**. Missing configuration shows an honest unavailable state. **No Apple/Google purchase, live charge, store submission or agreement acceptance was performed by this preparation.**

## Draft App Privacy / Data safety inventory

These are candidate classifications inferred from source, to review against the final binary and provider practices. Each store's definitions differ; this is not a completed form. See [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) and [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Data and use                                                                   | Apple candidate                                             | Google candidate                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Account email, optional display name, account/workspace IDs                    | Contact Info: Email Address, Name; Identifiers: User ID     | Personal info: Email address, Name, User IDs                   |
| Age band, versioned legal acceptance and timestamp                             | Other Data / User ID linkage — review                       | Personal info: Other info — review                             |
| Tasks, projects, notes, journals and flashcards                                | User Content: Other User Content                            | App activity: Other user-generated content                     |
| Planned focus sessions in the internal calendar                                | Other User Content                                          | Calendar: Calendar events — review                             |
| Focus history and personal progress reports                                    | Usage Data: Product Interaction / Other Usage Data — review | App activity: App interactions / Other actions — review        |
| Optional private mood/energy entries and notes                                 | Health & Fitness: Health — review                           | Health and fitness: Health info — review                       |
| Optional background image synced in preferences                                | User Content: Photos or Videos                              | Photos and videos: Photos                                      |
| Stripe/native subscription state, purchase references and opaque store binding | Purchases: Purchase History; Identifiers — review           | Financial info: Purchase history; User IDs — review            |
| Retained provider/security logs, request metadata and IP addresses             | Diagnostics / other type according to actual use            | App info and performance / identifiers according to actual use |

Candidate purposes are functionality, authentication/account management, requested sync/collaboration, personalization and security/fraud prevention. Personal progress reports alone do not establish developer analytics use. Cloud records are linked to accounts/workspaces; optional data still needs review. Mood may require health-data treatment despite the absence of HealthKit/Health Connect. Legal acceptance does not replace any separate health-data consent or other legal condition that is needed.

Local content is separate from cloud content and is not automatically imported on signup. On-device-only content differs from transmitted content; account traffic, providers and purchase validation still require disclosure. Organization content is visible to its members, including viewers; private moods/preferences are separate. Assess Google's processor and user-initiated-sharing exceptions before choosing sharing answers. Do not claim the whole app collects no data or that pseudonymous tokens are anonymous.

The client does not log or persist store receipts/tokens in local storage or exports. The backend retains purchase references for verification/reconciliation. Account deletion strips live native references but retains an unlinked opaque account token and non-reassignable purchase hashes to prevent receipt reuse. Their retention grounds/criteria must be finalized. Stripe/Apple/Google histories, provider logs/backups and independent exports are not automatically erased by app deletion. Card entry is handled by the payment provider; Solace does not receive the full card number.

Review Vercel, Supabase, Resend, Stripe, Apple and Google roles, locations, retention and transfers. No advertising/tracking SDK was found in the inspected dependencies; confirm the final binary and provider practices before selecting tracking/advertising answers.

## Native permissions and validation

Android source requests Internet, notifications and optional exact alarms; app backup is disabled. No location, contacts, microphone or device-calendar permission is declared. The final signed AAB/APK include Billing permission and Play Billing 9.1.0 metadata; signatures, packaged configuration and source alignment were verified. See [Android release artifacts](android-release.md#final-signed-candidate). They have not been installed on a phone or uploaded. iOS declares photo-library/camera purposes for the optional background chooser. Its privacy manifest declares no tracking and lists required-reason APIs; review all SDK manifests and the aggregate Xcode archive report. Notifications follow user action; exports use a share sheet; focus audio is playback. No HealthKit, Health Connect, location or audio-recording integration was found.

The final full unit run passed **779 tests in 64 files**; **516 isolated SQL assertions across 15 migrations and 12 suites** also passed. The purchase subset includes 45 adapter/UI tests and 11 intercepted native-browser cases; separate consent/age/deletion/native-bridge regressions passed. Web/mobile builds and browser checks cover 320px public pages, no-JavaScript deletion guidance, explicit confirmation, recovery, pending/canceled/expired intents and no optimistic Pro grant. These use synthetic accounts/intercepted bridges, not real store purchases or proof of installed-device behavior. See [verification.md](verification.md) and [mobile.md](mobile.md) for artifact-specific results.

Live HTTP checks confirmed the six public routes, publisher/support text, provisional indexing rules, current signup marker/project/policy versions, published license source and `checkoutEnabled: false`. Unauthenticated legal-consent access returns 401. **Six Chrome public/deletion tests passed against the actual domain**; these did not delete an account or make a purchase.

## Remaining owner and release work

1. Complete [privacy-review.md](privacy-review.md), including the chosen all-ages local audience, professional/trader status, applicable public contacts, countries, lawful bases, retention and provider transfers. The owner has not arranged public postal/phone/business details; commercial sales remain closed. Store ratings and Families/Kids declarations remain unanswered; no rating is promised.
2. Finish commercial hosting. Vercel remains **Hobby**; a Pro upgrade is prepared but not purchased/activated. Use the [Pro preparation guide](vercel-pro-upgrade.md). Its [terms](https://vercel.com/legal/terms) distinguish Hobby use from commercial hosting. Review the final plan, DPA and content-processing settings before provider assurances. Keep launch attestations false until their facts are satisfied.
3. Complete policy review and owner-run end-to-end signup/email QA with the enabled hook and matching web/native builds. Verify authorized disposable-account/device deletion and acceptance without exposing credentials; live public-route and pure-function checks do not prove those authenticated flows.
4. Configure Apple/Google records, agreements, payout/tax details, monthly products and server credentials/notifications. Test sandbox purchase, renewal, pending approval, cancellation, restore, refund/revocation, replay/account binding and reconciliation on actual stores/devices before opening production purchases.
5. Use the verified [signed Android candidates](android-release.md#final-signed-candidate) for owner-approved device QA and preserve the upload key with an owner-controlled backup. Finish macOS/Xcode iOS signing/archive/device checks. Complete privacy, data safety, app-access, content/audience forms and real screenshots. [store-listing.md](store-listing.md) provides draft copy, URLs and review notes; none has been uploaded or approved.

These URLs are live; complete the policy review before store submission:

| Field            | URL                                                                         |
| ---------------- | --------------------------------------------------------------------------- |
| Privacy          | [Solace privacy](https://www.solace-pomodoro.com/privacy)                   |
| Account deletion | [Delete a Solace account](https://www.solace-pomodoro.com/account-deletion) |
| Support          | [Solace support](https://www.solace-pomodoro.com/support)                   |
| Terms            | [Solace terms](https://www.solace-pomodoro.com/terms)                       |
| Publisher notice | [Solace legal notice](https://www.solace-pomodoro.com/legal)                |

The deletion paths address the respective [Apple](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) and [Google](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) requirements; they do not establish approval.
