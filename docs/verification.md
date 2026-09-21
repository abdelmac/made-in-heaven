# Verification record

Latest hosted verification was performed on September 21, 2026 for the new, independent `solace-hikmagitz` installation. Earlier `folia-ennearock` records are retained below; its Stripe sandbox offering does not apply to the new site.

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
