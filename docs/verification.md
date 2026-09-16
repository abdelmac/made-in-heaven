# Verification record

Latest hosted database setup and verification were performed on September 16, 2026. Stripe provider checkout remains unverified without its test credentials. Earlier release records are retained below.

## September 16: dedicated Solace database and payment preparation

- Created a separate **Solace** project (`xtvgadjobeecjwgzqwpp`) in Supabase's Paris region on the Free plan. Existing projects were not changed.
- Applied migrations `0001` through `0008` with their original versions. Hosted read-only checks passed for all 25 application tables, 15 RPC permissions, RLS, client write restrictions, server privileges, extension placement, account deletion guards, constraints, and the seeded billing policy.
- Configured the production origin and authentication callbacks, with separate modern publishable and server-only API keys stored privately and in Vercel.
- During setup, a PowerShell array-handling bug combined legacy public and server keys into a public environment value. The initial configuration deployment was defective. Both legacy API keys were disabled and the old HS256 signing key was revoked; direct checks rejected the previous credential in both Auth and database requests, including when paired with the replacement public key. The active ES256 signing key was preserved. Subsequent checks found zero accounts and zero workspaces, and all database permission checks passed again.
- Added a prebuild credential guard that loads Next.js production environment files and rejects misplaced server keys, combined values, malformed keys, and wrong-role or wrong-project legacy tokens before bundling. All **11 targeted guard tests**, TypeScript checking, and scoped lint passed.
- The corrected production deployment (`dpl_DD6dHfCtcUtDsuW9vi2VE11d4KVP`) built successfully with the guard enabled and serves `https://folia-ennearock.vercel.app`. The defective deployment was removed after its replacement became ready.
- Scanned the live HTML and its seven initial JavaScript assets (1,588,592 bytes): the expected publishable key was present, while the actual replacement secret key, secret-key patterns, and service-role JWTs were absent. This check covers the initial public assets, not every dynamic import or historical cache.
- **Hosted cloud journey passed:** a disposable confirmed account signed in through the actual UI, received a private Free workspace, saved one task through authenticated sync, and restored it in an independent second browser session. The billing endpoint reported owner access with Free entitlements and no paid features. No browser exceptions occurred. The test account, workspace, content and rate-limit records were removed and cleanup verified. This test did not send account email or test email delivery.
- Selected **Solace Pro at EUR 1.00/month**, sandbox only. The 27 targeted billing configuration, authorization, and entitlement tests passed. Stripe resources, Checkout, Portal and webhook delivery remain pending the test API key; no payment or subscription was created.

Email confirmation/recovery delivery and the full Stripe owner journey still need verification. Provider tests must not substitute local previews or manually assigned paid entitlements for a real sandbox payment.

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

Provider confirmation/recovery email and the remaining account lifecycle flows, two authenticated physical devices, actual Stripe test Checkout/Portal/invoices and event delivery, and phone installation/locked-screen behavior. Hosted password login, personal onboarding, Free billing reads and cloud task persistence across independent browser sessions were verified on September 16. Provider endpoints do not simulate successful subscription payments or cloud synchronization when configuration is absent.
