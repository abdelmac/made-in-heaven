# Verification record

Latest hosted verification was performed on October 27, 2026 for the independent `solace-hikmagitz` installation and its custom domain. The latest database audit remains September 22. Earlier `folia-ennearock` records are retained below; its Stripe sandbox offering does not apply to the new site.

## October 27: bundled iOS and Android client — development verification

- Added a Capacitor 8.5.3 mobile build that bundles the existing React workspace, fonts and local assets. Both projects use `com.solace.pomodoro`; mobile pages work without downloading the website. The Next.js API remains hosted separately. Android targets SDK 36 with minimum API 26/Android 8.0. The iOS Swift Package Manager project and seven native plugins were generated and synced; iOS compilation requires macOS/Xcode and was not performed here.
- Added exact native-origin CORS for `capacitor://localhost` and `https://localhost`. Native API calls use a validated Supabase bearer token and the public project key for user-scoped RLS, with no browser-cookie fallback. Existing browser origin checks remain in place. Every mobile-facing API route now has a CORS response wrapper and explicit `OPTIONS` handler; Stripe's webhook is excluded. Focused tests cover allowed/foreign preflights, invalid/missing native tokens with cookies present, Auth validation and per-user membership queries. No database migration was created or applied.
- Native sessions use device-only iOS Keychain/Android Keystore-backed storage; workspace documents, appearance and pending sync state use scoped app-private Preferences. Secure initialization boxes Capacitor plugin proxies so Promise resolution cannot invoke a synthesized `.then()` bridge method. Bridge fixtures caught and verified the fix for a native-startup hang that ordinary plugin mocks did not expose.
- Native callbacks accept the exact `com.solace.pomodoro://auth/callback` route, exchange installation-bound PKCE codes or supported email token hashes, and reject arbitrary access-token fragments. Password-recovery callbacks reopen a fresh account form. Native lifecycle handling reconciles timer deadlines, schedules/cancels OS reminders, restores session refresh on foregrounding and handles Android Back. Actual OS notification delivery has not been tested on a physical device.
- Exports use private `Cache/exports/<UUID>/<original filename>` paths and retain files after a share-sheet handoff. Cleanup checks fresh metadata and removes only validated export folders older than 24 hours, skipping active handoffs. Android FileProvider is limited to `Cache/exports/` plus external-files `Pictures/` for the standard camera chooser, with no broad root paths. Export handoff, cleanup confinement and browser fallback have focused regression tests; receiving apps have not been tested on a physical phone.
- **532 unit/server tests passed across 52 files** after adding route-owned CORS. **Six mobile browser scenarios passed:** four shared-interface flows and two deterministic native-bridge flows exercising the actual bundled JavaScript with mocked Preferences, secure storage, authentication and API responses. These validate local/native client branching, bearer request construction and reload restoration; they do not establish real provider authentication, device encryption, OS background execution or hosted cloud saves.
- The Next.js **16.4.3** web production build and the mobile client build passed. Compatible dependency security updates reduced the installed dependency audit to **zero reported vulnerabilities**. This is the package audit's scope, not a general security certification.
- The first Android native compile passed in **7 minutes 56 seconds, 305 Gradle tasks**. The final APK rebuild passed in **52 seconds**, with 305 tasks (34 executed, 271 up to date), and includes the production public configuration, initialization fixes and API 26 minimum. `.local/exports/solace-debug.apk` is **6,064,184 bytes**, SHA-256 `7c90aaa89d9c1a39acb0bd799da8aafa0f2de1cd74147b083d35040c43301609`. Android `aapt` verified identifier `com.solace.pomodoro`, minimum SDK 26 and target SDK 36; `apksigner` verified its v2 debug signature. This is a debug build, not a signed store release. No iOS binary was produced.
- The root workflow read only the hosted project's public connection configuration using `npx vercel@59.25.4 env run -e production --project solace-hikmagitz --scope hikmagitzs-projects -- node scripts/capture-mobile-public.mjs`. The helper wrote only public URL/key fields to ignored `.local/mobile-public.json`; the mobile loader validates them using the shared public-credential guard. No server credential is included in that capture or the client bundle.
- Initial native-backend deployment `dpl_71n9unXGuH8yQEwzMhNybzB2Mpgs` reached Ready, but live HTTP verification found missing CORS headers and default `204` responses even for foreign-origin preflights. The same problem reproduced against the local Next.js 16.4.3 production server despite Proxy appearing in build output. Native authentication still rejected unauthenticated requests, and browser origin guards remained intact. This prompted the route-owned CORS fallback rather than relying on Proxy for transport security.
- Replacement production deployment **`dpl_A4skvBpiEPhfMJteyqKGWZanz67X`** reached Ready at **`https://www.solace-pomodoro.com`**. All **four real HTTP API integration cases passed locally and in production**: exact native-origin preflights, public and protected response headers, rejection of foreign origins/unapproved headers, and preservation of canonical browser origin checks. Additional production probes verified `/api/workspaces` returns `401` with the exact permitted CORS origin and no credentialed-cookie header for invalid bearer tokens from both native origins. These unauthenticated probes did not write user data.
- **65 distinct web browser scenarios passed** across the complete run and targeted reruns, including the four new API integration cases. Two existing connected billing fixture scenarios were skipped. An initial session-reflection test advanced its fake clock before the asynchronous timer start/preset persistence completed; the test now waits for the preference write and running timer state before advancing time. All four learning scenarios passed after that correction. Production homepage/overview checks found no page exceptions or horizontal overflow; the subsequent correction changed only API wrapping.
- Final ESLint, TypeScript, web/mobile builds, formatting, secret checks and dependency audit passed, with **zero reported dependency vulnerabilities**. No test result is being used to claim an installed-phone check or a completed store submission.

The Supabase plugin is not connected and no Management API access environment was available, so the hosted native redirect allowlist was not changed. Add the documented callback through the matching project's dashboard or a connected management tool before testing native email links. Native email confirmation/recovery, authenticated installed-app saving and hosted mood migration readiness remain unverified. Mobile store purchase controls are unavailable; StoreKit/Play Billing, store-ready account deletion, final policy/disclosure content, release signing and submission remain later steps. No database/schema records, billing, hosted authentication settings, production environment variables or payment resources were changed; the backend source was deployed to enable native API access.

## October 5: custom-domain origin correction — hosted verification

- Verified that `www.solace-pomodoro.com` serves `hikmagitzs-projects/solace-hikmagitz` and that the local Vercel link now points to that same project. The homepage, overview, mood page and settings loaded in a fresh signed-out browser without page errors; the earlier deployment-target ambiguity is resolved.
- Reproduced `403 {"error":"Cette demande doit provenir de Solace."}` using the custom-domain origin. The same deliberately incomplete, unauthenticated request passed the origin check when sent with the old `https://solace-hikmagitz.vercel.app` origin. Production `NEXT_PUBLIC_APP_URL` still contained that old hostname.
- Updated only that non-secret Production variable to `https://www.solace-pomodoro.com` and rebuilt the already-live deployment `dpl_8vK4fxF7ff1PmMdCkrfppR6VNQLD`. Replacement `dpl_EUfmpu5xrWUcfGrsGbB2SNB6Dt1C` reached Ready and was aliased to the custom domain. Application source and origin protection were unchanged.
- After publication, the canonical-origin probe reached input validation (`400`, expected for a missing workspace ID). Old-host, unrelated-origin and missing-origin probes remained `403`, and an explicit cross-site request remained `403`. A valid-shaped workspace ID without a session returned `401`, confirming authentication is still required. None of these probes can write data.
- A real browser request from the custom domain also passed the origin check. The public timer started and paused at `24:59`, and its workspace link opened the overview without page exceptions.

This correction did not modify database records, migrations, account settings, billing or email providers. Authenticated saving and hosted mood migration readiness were not verified in this run. Earlier local-only publication statements below describe their dated checks, not the current hosting state.

## September 27: public home page — local verification

- Added a French public home page at `/`, with a simple 25-minute focus / 5-minute break timer, a three-step Pomodoro guide, workspace feature links and introductory questions. Public explanations are server-rendered and remain readable without JavaScript.
- The practice timer uses elapsed deadlines, supports pause/resume/reset and restores from this tab's session storage after refresh. It works when browser storage is blocked. It does not create a local workspace, record focus sessions or alter an existing workspace timer.
- Existing workspace query links, invitations, recovery, verification and checkout returns remain supported. The installed app opens `/?view=overview`; its identity stays unchanged. Workspace logos return to home, and public information pages return directly to the workspace.
- **410 unit/server tests passed across 40 files.** Focused timer, routing, callback and public-page tests were rerun after final adjustments. Production build, TypeScript, ESLint and formatting passed. No database changes are required for this home page.
- Browser coverage includes home navigation, paused/running timer recovery, explicit break start, blocked storage, static public HTML, active workspace timer preservation, accessibility and responsive widths of 320, 390, 768 and 1440 pixels. Desktop and mobile screenshots were inspected. Existing offline task/timer recovery, cache privacy and first-use workspace guidance also passed.

This update has not been published. The deployment target ambiguity and prior mood migration requirement documented below remain unresolved; no hosted provider settings were changed.

## September 24: private mood tracker and calendar views — local verification

- Added a private daily mood check-in, optional energy and short note, overview shortcut, monthly history, editing and confirmed deletion. Day boundaries use the workspace timezone; future entry creation is prevented. Entries are separate from shared events and completed focus statistics.
- Mood preferences reuse the existing per-user/workspace storage, viewer preference permissions, local persistence, offline queue and explicit conflict handling. Separate capability negotiation keeps old network clients compatible. The migration `20260924215000_private_mood_preferences.sql` preserves omitted mood data atomically across full, incremental and preference-only saves; explicit empty arrays still clear the log. No new table or shared read permission is added. See [mood-storage.md](mood-storage.md) for the 730-date bound and the existing JSON import limitation.
- The calendar now offers Week, Month and Agenda views, task deadlines, daily focus totals, date navigation, keyboard movement and task-to-session scheduling with context prefilled. Recurrence, overlap protection, weekly drag/drop and personal `.ics` export are preserved; export follows the displayed period. Mobile filters and export help collapse to leave room for the calendar.
- **385 unit/server tests passed across 37 files.** Production build, TypeScript, ESLint, formatting and Git whitespace checks passed. The new tests cover validation, legacy omission/response negotiation, per-actor reads, and absence of mood data in analytics/template responses.
- **328 SQL assertions passed across 12 migrations and 9 suites** in isolated PostgreSQL 18.3/PGlite 0.5.8. The 53 new mood assertions and existing private-preference, learning and incremental-sync regressions also passed on isolated PostgreSQL 17.11 in Docker; the run-owned container was removed. These tests exercise actual local SQL transactions and roles, not hosted Auth or simultaneous browser connections.
- **55 distinct production browser scenarios passed** with Microsoft Edge and production PWA behavior enabled. Five activity scenarios passed in the first run; the final run passed all 50 other available scenarios, including four mood and three calendar cases, offline mood reload, weekly drag/drop, recurrence, accessibility, learning, appearance and the complete productivity journey. Two existing connected billing scenarios were skipped because they require the separate connected fixture build. The four-scan accessibility test initially exceeded its shared 30-second budget; its budget was raised to 90 seconds without removing assertions and its final run passed in 27.2 seconds.
- Desktop and mobile screenshots were inspected. Automated checks found no page exceptions or document overflow at the tested sizes. An independent review checked mood lifecycle/privacy and calendar date boundaries; an overview sibling-key warning found in development was fixed before the final production build.

No hosted migration, deployment, payment, email or account mutation was performed. Publishing is pending target clarification: the repository installation guide names `hikmagitzs-projects/solace-hikmagitz`, while this checkout's local Vercel linkage still names `ennearock/folia-ennearock`. The compatibility migration must precede publication; CI now requires the explicit `SOLACE_MOOD_MIGRATION_READY` readiness flag. No remote readiness flags were changed.

## September 22: hosted database upgrade, payments still closed

- Rechecked CLI identity/project linkage and the exact Supabase project `zwgjauskorkpucuaqvgs`. Vercel remains Hobby. Production has no Stripe variables, Supabase Auth still requires confirmation, custom SMTP is absent, and the owner confirmed the exposed Stripe key has not yet been replaced. No request used that Stripe key.
- Applied only migration `0011_billing_environment.sql` in one transaction after checking the previous ten recorded SQL migrations against the checkout (normalizing line endings only). The transaction used a five-second lock timeout, verified all pre-existing billing row fields remained identical, and registered the migration with its source SQL. Existing users and productivity content were not modified.
- Hosted postchecks passed: single `test/NULL` binding, RLS, client denial, service-only assertion/configuration privileges, denied direct service-role updates to the binding, expected NOT NULL/default columns, matching record modes and all four enabled protection triggers. Counts before/after the upgrade: **2 users, 2 workspaces, 0 subscriptions, 0 billing events**.
- A real hosted smoke test passed on the unchanged application: disposable confirmed test user (no email), password sign-in, Free personal onboarding, task persistence and restoration in an independent browser, Free billing/audio entitlements, mobile width and no browser exceptions. Guarded account deletion succeeded; the temporary workspace and rate-limit records were removed and cleanup verified. No existing user was deleted.
- Public HTML and seven initial JavaScript assets contained none of the tested private Supabase credentials. Anonymous access to account/workspaces/audio endpoints was refused. This is a targeted asset check, not an exhaustive secret audit.

No new application deployment, Stripe configuration, live payment, SMTP activation, purchase or hosting-plan change was performed. Domain/budget, seller identity/documents and a replacement Stripe credential are still needed; Resend access was proposed but not confirmed. The record below describes the earlier local preparation, before this hosted SQL upgrade.

## September 22: launch preparation — local verification only

- Prepared explicit test/live mode and account binding, migration `0011`, fail-closed workspace/API checks, safe webhook receipts, resource-mode validation and a separate new-checkout launch gate. Existing cancellation/invoices/webhook processing do not depend on that launch gate. Legacy test Checkout idempotency keys and metadata are preserved.
- **359 unit/server tests passed across 33 files.** Both ordinary and fixture-configured Next.js production builds passed. TypeScript, ESLint, Prettier and the working-tree Stripe-secret check passed.
- **275 isolated PostgreSQL assertions passed across 8 suites and 11 migrations**, including a real transactional upgrade of legacy test billing rows. This is local PGlite, not an applied hosted migration or concurrent PostgreSQL connection test.
- **44 production browser tests passed**, including production PWA/offline behavior; 2 connected billing scenarios were skipped because that build had no public Supabase configuration. A separate production build with public fictitious Supabase values and empty server keys then passed **all 15 targeted billing/audio/public-information tests**, including those 2 connected scenarios and the 4 new mobile pages. These are **50 distinct successful browser scenarios across the two runs**, with 9 overlapping scenarios. Chrome was used locally; no real provider calls or transactions were part of these browser fixtures.
- Added public `/legal`, `/privacy`, `/terms`, `/support` pages with honest draft notices and noindex until owner information is complete. No seller identity or legal contract was invented. Signup/recovery HTML templates passed local callback-link checks; no email was sent.
- `npm run launch:check` was exercised in its offline mode and correctly returned incomplete local configuration. Its online mode is read-only by design but was **not executed with the exposed key**. It does not prove delivery of webhooks/mail or the hosted purchase lifecycle. CI includes the Stripe-secret guard and fixture-based connected billing tests; deployment gains an explicit migration-readiness attestation.
- A real Stripe private key was discovered in tracked `.env.example` and its HEAD revision. The current example is cleaned; **the key must be revoked/rotated and the Git history remains untouched**. The new credential scan checks working project files, not historical commits or all secret types.

No live catalogue, subscription, payment, SMTP configuration, hosted migration, deployment, domain purchase or paid hosting change was performed for this preparation. The new migration must precede deployment. The owner has no domain/mail service yet; seller documents, commercial hosting, key rotation, provider configuration and real hosted validation remain required. Follow [launch-runbook.md](launch-runbook.md).

## September 21: new Hikmagitz installation

- Created the separate Vercel Hobby project `hikmagitzs-projects/solace-hikmagitz` and Supabase Free project **Solace Hikmagitz** (`zwgjauskorkpucuaqvgs`, Paris). No existing project, account data or payment configuration was modified or copied.
- Applied all ten original migrations in separate transactions on PostgreSQL 17.6 and recorded their original versions, names and SQL. Final hosted read-only checks verified RLS on all **26 public application tables**, no anonymous SELECT grants, no direct authenticated INSERT/UPDATE/DELETE grants, and all **11 public service-only RPCs** denied to anon/authenticated with empty search paths. The `pro-audio` bucket is private and its restrictive client policy is present.
- Configured a modern Supabase publishable key and a distinct server secret in Vercel Production, with the exact new site origin. Auth callback redirects are configured and email confirmation remains required. No secret was placed in a versioned file.
- Production deployment **`dpl_t9Wj9Y9Tn7C3FsPCCFczMjFTq18p`** is `READY` at **<https://solace-hikmagitz.vercel.app>**. Its Node.js 22.x build passed the credential guard, Next.js production compilation and TypeScript checks.
- Re-ran **218 unit/server tests** and **191 isolated PostgreSQL assertions** successfully. The separate SQL harness result does not substitute for hosted service checks.
- **Five public production browser scenarios passed (19.9 seconds)** on the new site: first-use guidance, recurrence/calendar export, intentional audio playback, mobile timer access and automated accessibility. These use browser-local data, not fake cloud success.
- **Authenticated hosted journey passed:** created a disposable, explicitly confirmed test account without sending email; signed in through the deployed interface; obtained a private Free workspace; saved a task; restored it in an independent second browser context; confirmed actual Free billing/audio entitlements and unavailable Checkout. This verifies password login and ordinary cloud synchronization, not signup email delivery.
- Desktop and 390px screenshots were inspected. No browser exceptions or mobile page overflow occurred. The successful run deleted its account through the guarded application endpoint, then removed only its rate-limit records and verified cleanup. A preceding test-selector mismatch was corrected and its separate temporary account was also removed. Final hosted counts are **zero accounts and zero workspaces**; no email or payment was sent.
- Scanned the public HTML and seven initial JavaScript assets: neither the actual server key nor the management token appeared, and no modern server-key pattern was found. This check does not cover every dynamic import or future build.

**Remaining activation:** custom SMTP is required before treating public signup and password-recovery email as available. Supabase rejected custom email templates on the Free project using the default email provider, so those templates remain unchanged. Resend, Stripe, licensed Pro audio tracks and GitHub deployment automation are not configured on this installation. See [installation-hikmagitz.md](installation-hikmagitz.md) for exact targets and next steps. No paid plan was activated.

## September 16: French product update — local verification

- Implemented French interface copy and dates, Solace-facing downloads, guided first-objective creation, daily/weekly personal summaries, finite task/session recurrence, filtered personal-week calendar export, optional invitation email delivery, a persistent audio player and protected Pro/Team audio catalog. Existing user content and technical storage identifiers are preserved.
- Added version-consistent paged cloud reads and compact, durable, replay-safe changes for large saves. API tests cover authorization, origin checks, validation, conflicts, page consistency and retries. This improves network transfer, not the whole-document server projection or browser storage limits; new deltas still have a 2 MB request limit.
- **218 unit/server tests passed across 26 files.** Production build, ESLint, TypeScript, formatting and Git whitespace checks passed.
- **All 38 production browser scenarios passed in one final run (46.1 seconds).** Tests ran against the final `npm start` build with Microsoft Edge and production PWA behavior enabled. Coverage includes the complete personal journey, French first use, recurrence persistence and atomic conflict rejection, calendar download, intentional audio playback and navigation, accessibility, offline recovery and layouts from 320 to 1440 pixels. Earlier desktop and mobile screenshots were inspected without browser exceptions.
- **191 actual PostgreSQL assertions passed across 7 suites**, after applying all 10 migrations to an isolated PostgreSQL 18.3 WASM runtime (PGlite 0.5.8): security 41, billing 38, organization defaults 17, private preferences 13, learning/backgrounds 55, incremental synchronization 20 and audio 7. The reproducible runner is `node scripts/verify-database.mjs`; setup is documented in [security.md](security.md).
- SQL execution caught and fixed an operator-precedence error in migration 0009 that could replace existing collections when merging patch metadata. Regression assertions now verify exact remove/replace/insert/order behavior, preservation of untouched collections and metadata, transaction rollback and replay receipts.
- Added CI quality checks including the isolated SQL runner and an explicitly opt-in Vercel deployment job. No hosted migrations, account settings, email sends, audio uploads or deployments were performed for this update.

The local SQL bootstrap has minimal Auth fixtures and no Supabase Storage schema. These results do **not** verify hosted authentication, actual email delivery, Storage bucket policies, simultaneous database connections, or the remaining Stripe provider lifecycle checks. Apply migrations 0009 and 0010 before deploying the new server, then complete the activation steps in [product-update.md](product-update.md). Calendar export is a snapshot, not continuous Google/Outlook synchronization.

## September 16: activity range, planner movement, and appearance fixes

- Added a selectable 52-week/month activity overview with month navigation, scoped device persistence, matching filtered totals/details and disabled future dates. Seven unit tests and four browser scenarios cover date boundaries, leap years, storage failure, filtering, persistence and 320px layout.
- Added native drag/drop for scheduled sessions and unplanned tasks, plus keyboard/touch selection and placement. Seven unit tests and five browser scenarios cover duration/context preservation, overlap rejection, foreign drag payloads, persistence, precise editing, accessible movement and mobile scrolling. Moves use the existing store validation, undo and synchronization path.
- Appearance now resolves the complete palette, previews background/custom theme edits immediately, preserves previews during unrelated preference changes and keeps saving explicit. Planner minute labels use readable foregrounds for arbitrary accents and custom heatmaps. Ending a preview cancels pending image preparation. Four personalization browser scenarios cover palette updates, save/reload, preview restoration, image validation and cancellation.
- **167 unit/server tests passed across 18 files.** Production build, ESLint, TypeScript, formatting and Git whitespace checks passed.
- **35 distinct production browser scenarios verified:** the full 34-scenario suite passed, then all 11 affected appearance, planner and accessibility scenarios passed again after the final contrast/cancellation fixes, including the additional upload-cancellation scenario. Tests ran against `npm start` with Microsoft Edge and production PWA behavior enabled. The full run includes existing billing, learning, productivity and offline checks.
- Desktop/month/background and mobile/planner screenshots were inspected; no mobile page overflow or browser exceptions were observed. Independent code reviews covered activity boundaries/storage scope and appearance lifecycle/contrast.
- Production deployment `dpl_E9e1KURhkFbKbahPFJAXZvvB7WVf` is ready at `https://folia-ennearock.vercel.app`, built from commit `31da1bc`. A fresh browser on the public site verified month-view persistence, draggable planner controls, saved background persistence and 390px layout with no page exceptions. This smoke check used browser-local demo data only.

These checks use local/demo workspace data and existing server unit coverage. This UI release does not reverify authenticated cloud synchronization or provider payment delivery; the hosted records below document those earlier checks. No database migration or billing configuration change is part of this release.

## September 16: hosted Stripe sandbox payments

- Configured the selected test product and recurring monthly Price, a Pro Customer Portal with cancellation at period end, and the hosted signed webhook endpoint. No annual or Team offering was enabled. The non-secret resource IDs are recorded in [billing.md](billing.md); API and signing secrets remain outside Git and in Vercel's server-only environment.
- Production deployment `dpl_GVZGYEgaXsYtSXZvMTZ8WtZvptdo` built successfully with the credential guard and serves `https://folia-ennearock.vercel.app`. The public catalog reports one available EUR 100-minor-unit monthly Pro Price and `mode: "test"`. An unsigned webhook request returns HTTP 400.
- A confirmed disposable `.invalid` account signed in through the deployed UI with a Free personal workspace, opened app-created Stripe Checkout, and paid **one EUR 1.00 sandbox invoice** using Stripe's documented `4242` test card. Provider reads verified the exact selected Price, quantity one, paid invoice, and active subscription. No real money moved or account email was sent.
- Stripe's natural, signed `invoice.paid` delivery was processed by the deployed webhook. The authenticated billing API then reported Pro, backgrounds and flashcards, with verified paid coverage through the subscription period. No entitlement or subscription record was manually assigned.
- Replayed that same already-processed provider event twice with fresh signatures generated locally by Stripe's SDK. Both requests acknowledged the duplicate and left the processed receipt timestamp unchanged. This verifies duplicate handling; it does not establish Stripe's automatic redelivery behavior.
- The deployed app opened the configured Customer Portal, where cancellation was scheduled at the current period end. This Stripe API represents the schedule with `cancel_at` equal to the item's `current_period_end`, while `cancel_at_period_end` remains false. The app already stores and exposes both fields; the operational verifier was corrected to accept the explicit date. The authenticated API retained Pro, backgrounds and flashcards with paid coverage through the exact provider period end, and the billing UI displayed the matching cancellation date.
- The final complete browser run passed all **11 checks**, including cleanup, from **15:46:16 to 15:47:38 UTC**. Cleanup canceled only the run-owned subscription without invoicing/proration, waited for natural deletion-event processing, removed the disposable app account/workspace through guarded account deletion, deleted its test Stripe customer and rate-limit records, and verified completion. Provider event/invoice history remains in Stripe's test environment. The private login journal was removed; sanitized operational results remain outside Git.
- Repeated the public HTML and seven initial JavaScript asset scan with both Supabase and Stripe server credentials: none of the actual private keys or generic secret/service-role patterns appeared; the expected public Supabase key was present. Coverage remains limited to the initial public assets, not every dynamic import or historical cache.

Renewal, failed-payment recovery, paid-period expiration, automatic provider redelivery, and a second authenticated device's Pro refresh still need hosted verification. Some concurrent subscription/Checkout deliveries received retryable failures while the paid-invoice event successfully provisioned access; successful automatic retries were not established. Live payments remain intentionally disabled.

## September 16: dedicated Solace database and payment preparation

- Created a separate **Solace** project (`xtvgadjobeecjwgzqwpp`) in Supabase's Paris region on the Free plan. Existing projects were not changed.
- Applied migrations `0001` through `0008` with their original versions. Hosted read-only checks passed for all 25 application tables, 15 RPC permissions, RLS, client write restrictions, server privileges, extension placement, account deletion guards, constraints, and the seeded billing policy.
- Configured the production origin and authentication callbacks, with separate modern publishable and server-only API keys stored privately and in Vercel.
- During setup, a PowerShell array-handling bug combined legacy public and server keys into a public environment value. The initial configuration deployment was defective. Both legacy API keys were disabled and the old HS256 signing key was revoked; direct checks rejected the previous credential in both Auth and database requests, including when paired with the replacement public key. The active ES256 signing key was preserved. Subsequent checks found zero accounts and zero workspaces, and all database permission checks passed again.
- Added a prebuild credential guard that loads Next.js production environment files and rejects misplaced server keys, combined values, malformed keys, and wrong-role or wrong-project legacy tokens before bundling. All **11 targeted guard tests**, TypeScript checking, and scoped lint passed.
- The corrected production deployment (`dpl_DD6dHfCtcUtDsuW9vi2VE11d4KVP`) built successfully with the guard enabled and serves `https://folia-ennearock.vercel.app`. The defective deployment was removed after its replacement became ready.
- Scanned the live HTML and its seven initial JavaScript assets (1,588,592 bytes): the expected publishable key was present, while the actual replacement secret key, secret-key patterns, and service-role JWTs were absent. This check covers the initial public assets, not every dynamic import or historical cache.
- **Hosted cloud journey passed:** a disposable confirmed account signed in through the actual UI, received a private Free workspace, saved one task through authenticated sync, and restored it in an independent second browser session. The billing endpoint reported owner access with Free entitlements and no paid features. No browser exceptions occurred. The test account, workspace, content and rate-limit records were removed and cleanup verified. This test did not send account email or test email delivery.
- Selected **Solace Pro at EUR 1.00/month**, sandbox only. The 27 targeted billing configuration, authorization, and entitlement tests passed. At this preparation stage, Stripe resources and provider verification were pending the test API key; the later sandbox record above supersedes that status.

Email confirmation/recovery delivery still needs verification. The subsequent Stripe checks above used a real sandbox payment and provider delivery, without substituting local previews or manually assigned paid entitlements.

## September 12: personalization, learning, and billing

- Production build, TypeScript checking, ESLint, and repository formatting checks passed.
- **139 unit/server tests passed in 15 files** (10.30 seconds), including preference validation, entitlement enforcement, billing configuration, legacy sync compatibility, notes, flashcards, and appearance contrast.
- **164 PostgreSQL assertions passed** against all eight migrations in an isolated PostgreSQL 17.11 database: 109 existing assertions and 55 learning/background security assertions. The temporary test container and volume were removed afterwards.
- **All 24 production browser scenarios were verified across a full run and a targeted retry.** The full run passed 23 scenarios; the export test encountered Windows `EPERM` when reading Edge's temporary download file. The test now verifies the exact JSON Blob supplied to the real browser download, the download filename, and successful completion without accessing that temporary file. Its targeted retry passed. This was a test harness change, with no subsequent application changes.
- Browser coverage includes the original productivity, responsive, accessibility, and offline scenarios plus three billing, four learning, and two personalization scenarios. The productivity journey also verifies the note prompt after a completed focus session.
- Personalization checks cover free custom accents, unsaved previews, saved backgrounds, reload persistence, mobile layout, image upload, and rejection of SVG without losing the saved background. Desktop and mobile screenshots were inspected.
- The model from the previously deployed commit was used to verify that legacy sync responses remain readable by older clients, including when modern notes, flashcards, backgrounds, completion fields, and accents are present.

The full production browser run used:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:PLAYWRIGHT_PWA='1'
npm run test:browser -- --workers=1 --output=.local/premium-production-results
```

The corrected export check was then verified with:

```powershell
npm run test:browser -- e2e/learning.spec.ts --grep 'local flashcards' --workers=1 --output=.local/premium-export-results
```

At the September 12 release, production had an application origin configured, but no Supabase or Stripe credentials. Hosted authentication, cloud synchronization, and actual provider Checkout/Portal/webhook delivery were therefore unavailable and unverified. The September 16 record above supersedes that configuration status. Billing remains test-only. Local previews of premium features do not confer a cloud subscription. Music playback is a documented next step, not an implemented player; see [music-pro.md](music-pro.md).

## September 11: initial release

The initial production application passed the executed checks below.

## Environment

- Windows PowerShell; Node.js 24.19.0, npm 11.17.0.
- Next.js 16.3.4, React 19.3.0, TypeScript 5.9.3.
- PostgreSQL 17.11 in an isolated Docker test project.
- Playwright with installed Microsoft Edge for browser verification.
- No hosted Supabase credentials or Stripe test credentials were supplied.

## Final observed results

| Command/check                          | Observed result                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run format:check`                 | Passed across the repository; generated Next declarations and build artifacts are excluded |
| `npm run lint`                         | Passed with no warnings or errors                                                          |
| `npm run typecheck`                    | Passed                                                                                     |
| `npm test`                             | **96 tests passed in 11 files**, 2.08 seconds                                              |
| `npm run build`                        | Passed; public application/manifest and authenticated server routes compiled successfully  |
| `npm audit --audit-level=moderate`     | **0 vulnerabilities** reported                                                             |
| Production Playwright suite            | **15 tests passed**, none skipped, 47.8 seconds                                            |
| PostgreSQL security suite              | **41 assertions passed**                                                                   |
| PostgreSQL billing suite               | **38 assertions passed**                                                                   |
| PostgreSQL organization defaults suite | **17 assertions passed**                                                                   |
| PostgreSQL private preferences suite   | **13 assertions passed**                                                                   |

The four SQL suites total **109 actual PostgreSQL assertions**, using the seven versioned migrations and real policies/constraints in an isolated database. The temporary Docker project was stopped and removed afterwards.

The final browser command, against the completed production build running with `npm start`, was:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:PLAYWRIGHT_PWA='1'
npm run test:browser -- --workers=1 --output=.local/production-results
```

The 15 scenarios cover:

- Subject creation → detailed task → checklist and development journal → planned focus → pause/reload/recovery → exactly one completed focus record → preserved context and subject history.
- Overlap rejection with the editor and saved data preserved.
- Development templates without fabricated activity or progress.
- Theme persistence, invalid import safety, initial dialog focus, Escape and trigger-focus restoration.
- Two-tab recovery without duplicate completions; reset/skip confirmations with no inflated totals.
- Page-width checks across Overview, Tasks, Planner, Subjects and Settings at **320, 390, 768, 1024 and 1440 pixels**.
- Mobile access to the active timer from a secondary page.
- Axe checks for default light/dark appearances, mobile, and task dialogs.
- Cached production launch, actual offline task edits and timer recovery, safe application-shell refresh, privileged endpoint exclusions, and selective private-cache cleanup.

Offline tests use a clearly identified seeded dormant account queue only to verify storage retention. They do not establish authenticated cloud replay.

## Implementation and review record

The initial repository contained no application or existing user data. Added files are grouped into `src/app` (shell and server endpoints), `src/components` (connected UI), `src/lib` (domain/schema/calendar/timer/persistence/auth/billing/localization), seven migrations, SQL and TypeScript/browser regressions, PWA assets, configuration/lockfile, and setup/security/billing/offline documentation.

Dependencies were installed and their lockfile generated. Initial sandbox registry/advisory failures were retried with approved network access. TypeScript and ESLint were pinned to versions compatible with the installed Next.js lint plugins.

Earlier browser runs identified missing dialog names and imperfect initial focus; both were fixed in the reusable dialog. Automated contrast checks found low-contrast muted text, planner text, a priority badge and the dark-mode current-day badge; their tokens were corrected. Development-server origin restrictions were addressed using the installed Next.js documentation. Independent database review also fixed account-deletion/Checkout races, private preference exposure, prepared-timer persistence, and version acknowledgement races.

The final successful suite supersedes those intermediate failures. No additional runtime changes were made after the final production run; only delivery documentation was finalized.

## External verification still required

Provider confirmation/recovery email and the remaining account lifecycle flows, two authenticated physical devices, Stripe renewal/failed-payment recovery/paid-period expiration and automatic redelivery, and phone installation/locked-screen behavior. Hosted password login, personal onboarding, cloud task persistence across independent browser sessions, and the sandbox Checkout/invoice/webhook/Portal journey were verified on September 16 as detailed above. Provider endpoints do not simulate successful subscription payments or cloud synchronization when configuration is absent.
