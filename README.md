# Solace

A calm, connected space for focused work. Solace combines a Pomodoro timer, weekly workload planner, subjects, projects, detailed tasks, development journals, activity history, and workspace subscriptions.

The Solace identity uses a crescent-and-star vector mark with a serif wordmark. Shared geometry lives in `src/lib/brand.ts`; run `node scripts/generate-icons.mjs` to regenerate the favicon and Apple/PWA installation icons. The existing deployment address, internal Folia identifiers, backup format, and storage keys are retained for compatibility with saved work.

This repository started empty. It now contains a Next.js App Router application, a useful local/demo experience, Supabase integrations and versioned PostgreSQL migrations, and Stripe **test-mode-only** billing. No external account or payment credentials are bundled. Local productivity works without them; sign-in, cloud sync, and checkout accurately show their configuration requirements.

## Run locally

Use Node.js 22.13+ on the 22.x line, Node 24.x (verified here with 24.19), or a newer compatible LTS release, and npm.

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The clearly labeled demo contains sample subjects, tasks, and planned sessions; completed focus totals start at zero. **Start fresh** creates a separate empty local workspace. Productivity data is saved on this device; there is no automatic local-to-account upload.

For the production build and service worker:

```bash
npm run build
npm start
```

The repository includes its dependency lockfile. Next.js and React use the compatible installed versions; TypeScript 5.9 and ESLint 9 are pinned to versions accepted by Next's lint plugins. Do not independently upgrade lint peer dependencies without running the checks.

## A complete local journey

1. Open **Subjects**, create a subject, and set its weekly goal in minutes. Add a project or resource from the subject details.
2. Create a task in **Tasks**, attach the subject/project, set its status and effort estimate, and add a checklist. List and board views both support keyboard controls.
3. Open the task's **Development** tab to record progress, decisions, blockers, next steps, or reflections. Notes support safe Markdown, revisions, and optional focus-session links.
4. Select a cell in **Planner**, choose a date, time, duration, and task, then save. **Focus now** starts the planned duration and freezes the session's original context.
5. Pause/resume or return after a reload. Only a fully elapsed focus session counts. Skips, resets, and breaks never inflate completed work, and the next phase waits for you to start it.
6. Inspect the subject's history, global history, analytics, or a day in the 52-week activity grid. Planning and completed work remain separate.
7. Use **Settings** for appearance, timer presets, calendar rules, widget ordering, named layouts, and portable JSON backups. Advanced features can be explored locally; server operations enforce the connected workspace's paid entitlements.

## Colors, backgrounds, notes, and flashcards

- **Free:** eight classic palettes, including blurple and charcoal, plus your own accent color. Light, dark, and system modes remain separate. Custom accents are adjusted for readable text. Find these controls in **Settings → Appearance**.
- **Pro / Team:** four gradient backgrounds or an uploaded JPG, PNG, or WebP, with dimming, blur, and a preview that does not save automatically. Images up to 8 MB are resized/compressed in the browser to at most 350,000 data-URL characters before storage. The background remains a private per-user preference; organization content never exposes another member's background image.
- **Free note sheets:** open **Notes** for subject-linked Markdown pages, edit history, search, and deletion. Subjects have a **Notes** tab and **Complete subject** action with an optional summary. Completing a subject does not invent focus time or finish its tasks. After a Pomodoro, **Add session note** links a reflection to that completed focus session.
- **Pro / Team flashcards:** create subject-linked decks, add question/answer cards, flip them with the keyboard, and choose **Again** or **Know it**. Practice results belong to the current study session and never count as Pomodoros. Cards remain readable/exportable after downgrade; creation, editing, and study require access. Connected study starts are authorized through `/api/flashcards/study`.

The disconnected local workspace clearly labels paid features as previews. Connected accounts use server-owned entitlements. Note sheets are free in personal workspaces; new shared organization content follows the Team policy. Authors control edits to their own shared notes and decks.

Migration `0008_learning_and_backgrounds.sql` adds the learning records, security policies, feature gates, and compatibility handling. Existing workspaces load new fields with safe defaults. Imports remap note/deck/card references and authors; Free cloud imports containing Pro flashcards are rejected before changing local work. Refresh older open Folia tabs after this release before editing on the same device.

Stripe checkout verifies the configured Customer Portal supports cancellation, invoice history, and payment-method recovery before starting a paid session. See [billing activation instructions](docs/billing.md) for the deployed site's exact configuration. Music is a proposed next feature; [the Pro audio guide](docs/music-pro.md) explains private audio storage, server access checks, and a persistent accessible player.

## Connect Supabase

1. Create a Supabase project, enable email/password authentication, and review provider rate limits and email confirmation requirements.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key), `SUPABASE_SERVICE_ROLE_KEY`, and the canonical `NEXT_PUBLIC_APP_URL`.
3. Apply every SQL file in `supabase/migrations` in lexical order using the Supabase CLI or your migration tooling. These are application migrations, not test fixtures.
4. Allow your origin's `/auth/callback` in Supabase redirect settings. Configure transactional email delivery and verification/recovery email templates. [Security documentation](docs/security.md) explains both PKCE and cross-browser token-hash confirmation.
5. Start/rebuild the server after changing public environment variables. Create an account using **Account**. A private personal workspace is created at onboarding. Passwords are handled by Supabase Auth.
6. Sign into another browser/device to use the same permitted workspace. Changes are saved through authenticated server APIs, with periodic synchronization and visible saving, pending, offline, error, and conflict states. Import a local export explicitly if you want to upload existing local work.

Never put the service-role key or Stripe secret in a `NEXT_PUBLIC_` variable. `.env.local` is ignored by Git.

`npm run build` first validates Supabase credential types and rejects server credentials in public settings before browser assets are generated. The hosted Solace app uses a dedicated Supabase project; password sign-in and cloud task persistence have been verified across two independent browser sessions. Email delivery and Stripe sandbox checkout remain pending; see the [verification record](docs/verification.md).

## Workspaces, permissions, and subscriptions

Personal workspaces are private. Organization membership does not grant access to members' personal records. Owner, admin, member, and viewer permissions are enforced in server handlers and database transactions, with RLS on all productivity tables. Owners alone manage billing and deliberate ownership transfer. Invitations expire, can be revoked, and are shared by link; this version does not send invitation emails automatically. Owners/admins can set an organization icon and timer/calendar defaults. Defaults initialize new member preferences once; members can explicitly apply updated defaults while keeping their appearance and accessibility choices. Viewers can save their own private preferences through a separate protected endpoint.

Create an organization from **Organization**, switch into it, and enable its Team subscription before creating new shared content or inviting teammates. Existing data remains available after downgrade. Subjects, projects, tasks, and work journals in an organization are shared content; keep private notes in a personal workspace. Appearance preferences and active timers remain per user.

See the [permission matrix and integrity model](docs/security.md) and [billing setup and entitlement policy](docs/billing.md). Configurable Free limits default to 10 subjects, 100 tasks, and 5 projects. Pro lifts configured personal limits and enables advanced customization. Team applies to one organization, includes applicable Pro capabilities there, and defaults to a flat subscription with up to 25 members. Prices and billing intervals come from actual configured Stripe Price objects; no invented prices or discounts are displayed.

### Stripe test setup

1. The selected first offering is **Solace Pro at EUR 1.00 per month**, in Stripe test mode. Create one recurring, licensed, per-unit Price at 100 minor units; leave yearly and Team offerings unset.
2. Set the test secret, `STRIPE_PRO_MONTH_PRICE_ID`, webhook secret, and `STRIPE_PRO_PORTAL_CONFIGURATION_ID` in `.env.local` (or the deployed environment). Other tiers and intervals need their own configuration only when offered.
3. Start the server and forward verified events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

4. Use the CLI's printed signing secret for local testing, then initiate Checkout as the appropriate workspace owner. The return URL never grants a plan; verified invoice/subscription processing updates trusted server entitlements.
5. Test renewal, failure, retry, downgrade, and cancellation using Stripe's test environment. Review the detailed commands and expected states in [docs/billing.md](docs/billing.md).

Live Stripe keys and live events are intentionally rejected. No real cards were charged during implementation.

## Persistence, conflicts, and offline use

- Timer deadlines and remaining duration are persisted, with stable session IDs and immutable historical context. One account cannot silently run overlapping focus timers across workspaces. A long absence completes at most the one active session.
- The local v1 storage envelope includes a revision and atomic cloud outbox metadata. Imports fully validate before mutation, preview counts, require confirmation, remap IDs, and cannot carry memberships or entitlements. No older Folia schema was present; unknown legacy formats are rejected without modifying existing data.
- Cloud writes use an expected version, stable operation ID, durable replay record, payload validation, and transactional normalized projections. A concurrent edit or offline timer conflict is preserved for explicit resolution, with export available.
- The production PWA caches a public app shell and static assets, never authentication or billing responses. Offline you can use the timer, read previously permitted cached work, and save task/journal/session edits for later validation. Privileged actions require a connection.
- Sign-out clears this account's device cache. Export queued work before deliberately discarding it. Updating the application cache does not erase productivity storage.

Installation needs HTTPS or localhost and browser support. Background tabs and locked screens may suspend alarms; reopening restores the correct deadline. Read [offline behavior and limitations](docs/offline.md).

## Architecture

| Location                                 | Responsibility                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app`, `src/components`              | Responsive application, native accessible dialogs, theme tokens, route handlers        |
| `src/lib/model.ts`                       | Strict schemas, entities, preferences, isolated demo and local data version            |
| `src/lib/timer.ts`, `calendar.ts`        | Pure timer transitions, IANA-zone buckets, overlap, metrics, contrast                  |
| `src/lib/persistence.ts`, `use-folia.ts` | Atomic local storage, imports, outbox, cross-tab coordination, cloud conflict handling |
| `src/lib/i18n`                           | English product copy, static interface catalogs, and paid-feature messages             |
| `src/lib/supabase`, `server`             | Auth clients, validated document access, permissions and request protection            |
| `src/lib/billing`                        | Central plan configuration, real Stripe integration, trusted entitlement policy        |
| `supabase/migrations`, `supabase/tests`  | Database schema, constraints, security policies and direct SQL regressions             |
| `public/sw.js`, `src/app/manifest.ts`    | Production offline app shell and install metadata                                      |
| `tests`, `e2e`                           | Domain/server regression tests and real-browser journeys                               |

Integration decisions were checked against official [Next.js documentation](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR documentation](https://supabase.com/docs/guides/auth/server-side/creating-a-client), and [Stripe subscription webhook documentation](https://docs.stripe.com/billing/subscriptions/webhooks). The installed Next.js package also includes version-matched documentation in `node_modules/next/dist/docs`.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

With an installed Microsoft Edge, browser tests can use `PLAYWRIGHT_CHANNEL=msedge`. `PLAYWRIGHT_BASE_URL` selects an already running server; the default is `http://127.0.0.1:3000`. The offline tests require a production server and `PLAYWRIGHT_PWA=1`; they are intentionally skipped in ordinary development runs. The responsive checks cover 320, 390, 768, 1024, and 1440 pixels. Automated axe checks cover light/dark appearances, mobile, and task dialogs, alongside actual keyboard focus and timer-access tests.

Direct database tests use an isolated Docker PostgreSQL instance and real roles, policies, constraints, and transactions. Follow the commands in [docs/security.md](docs/security.md). Never apply `supabase/tests/bootstrap.sql` to a hosted Supabase project.

Observed executions and exact test results are recorded in [docs/verification.md](docs/verification.md). A test is not considered verified merely because its code exists.

## Deployment and current limits

The public deployment is [folia-ennearock.vercel.app](https://folia-ennearock.vercel.app), hosted in the `ennearock/folia-ennearock` Vercel project. It currently runs the local/demo experience; Supabase and Stripe are not connected. `NEXT_PUBLIC_APP_URL` is configured as this exact production origin.

To deploy this checkout again using the authorized Vercel account:

```bash
npx vercel@59.16.0 link --yes --project folia-ennearock --scope ennearock
npx vercel@59.16.0 deploy --prod --yes --scope ennearock --logs
```

The first deployment used the CLI because Vercel could not obtain write/admin access to the configured GitHub repository. Automatic deployments on Git pushes are not connected. `.vercelignore` excludes local environment files, generated builds, test artifacts, and local scratch files from deployment uploads; Vercel project linkage stays outside Git.

Deploy to a Node-capable Next.js platform with Supabase PostgreSQL and HTTPS. Apply migrations before enabling the app, set server secrets and public build-time variables, configure email redirects and the Stripe webhook endpoint, and rebuild. This server-backed application cannot be deployed as a static-only site.

- Hosted Supabase sign-up/verification/reset, browser-to-browser authenticated sync, and real Stripe test Checkout/webhook delivery still require external credentials and end-to-end verification. Local PostgreSQL and mocked server tests do not establish those provider integrations as verified.
- Cloud synchronization uses workspace document revisions with normalized relational projections and a 2 MB request limit. Large histories/organizations will need paginated entity synchronization before that cap. There is no destructive automatic pruning.
- Concurrent same-record edits require explicit resolution; this version offers saved-version adoption or a documented local-preferred merge, with export before either choice.
- Local activity timestamps are validated but this is a personal productivity application, not an anti-cheating or payroll system. Imported completed history is intentionally permitted after validation and consent.
- Notification delivery while backgrounded or locked depends on the browser/OS. The app does not guarantee a background alarm.
- English is the only language shipped. Static display copy lives in the English catalogs, maintained with `scripts/extract-ui-copy.mjs`; additional locales require translation and locale-aware contextual formatters and validation messages.
- No GitHub integration, email invitation sending, live billing, seat-metered billing, or tax/legal compliance certification is implied.

User data is never removed because a subscription downgrades or an application cache updates.
