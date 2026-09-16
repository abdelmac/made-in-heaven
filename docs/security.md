# Security, privacy, and synchronization

Solace uses Supabase Auth and PostgreSQL. Browser clients hold a publishable key; the service-role key and Stripe secret are server-only. API authentication calls `auth.getUser()` rather than trusting cookie contents. Supabase SSR refreshes cookies through the Next.js proxy. Provider email confirmation and password-recovery redirects must be configured for the deployed origin.

The callback supports PKCE `code` exchange and email `token_hash` verification for signup, email confirmation, and recovery. To support confirmation links opened in a different browser, configure Supabase email templates to send `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup` (and `type=recovery` for reset). PKCE links require the browser that initiated authentication. Recovery always redirects to the application's password-reset form; arbitrary return URLs are rejected.

## Permission matrix

| Operation                                     | Owner                      | Admin | Member | Viewer |
| --------------------------------------------- | -------------------------- | ----- | ------ | ------ |
| Read shared workspace content                 | Yes                        | Yes   | Yes    | Yes    |
| Save own appearance/accessibility/preferences | Yes                        | Yes   | Yes    | Yes    |
| Edit shared subjects, projects, tasks         | Yes                        | Yes   | Yes    | No     |
| Record own timer, plans, notes, history       | Yes                        | Yes   | Yes    | No     |
| Modify another member's plans or notes        | No                         | No    | No     | No     |
| Rename organization                           | Yes                        | Yes   | No     | No     |
| Invite/remove members and viewers             | Yes                        | Yes   | No     | No     |
| Appoint/manage admins                         | Yes                        | No    | No     | No     |
| Transfer ownership                            | Yes, explicit confirmation | No    | No     | No     |
| Checkout, portal, invoices                    | Yes                        | No    | No     | No     |

Personal workspaces cannot accept memberships or invitations. Organization membership never grants access to a person's separate personal workspace. An organization can be created before checkout; inviting members, creating shared subjects/projects/tasks/journal entries, and new shared assignments require its own active Team entitlement. Existing content remains editable after downgrade and session completion stays available. Each workspace subscription has an independent scope.

All productivity tables have row-level security. Authenticated database roles have SELECT grants only, with membership policies. They cannot mutate documents, memberships, billing state, or execute service-only transaction RPCs directly. Mutations pass through authenticated API handlers, complete Zod validation, and SQL transactions that recheck current membership. The service role must never be exposed to the browser. Security-definer functions use an empty search path and explicitly qualified application tables.

Workspace subjects, tasks, journal entries, and activity are shared with that workspace's members, including viewers. Private notes belong in a personal workspace. Timers and preferences live in rows scoped to user and workspace, with self-only policies; shared JSON excludes preferences and contains only an idle timer placeholder. Personal appearance overrides therefore do not leak into another member's preferences.

Note sheets, subject-completion notes, and session reflections are Free in personal workspaces. Creating shared organization notes requires Team, consistent with the other shared content gates; existing organization notes remain editable after downgrade. Workspace members can read them; only their author can edit or remove them, including in organizations. Flashcard decks and cards follow the same author rules. References use composite workspace foreign keys, and cards must share their deck's author. Reflection notes can reference only that author's completed focus session and must match its subject when one is supplied. Note edits append the previous title and content to revision history. Deleting a subject cannot silently detach another author's notes or decks; archive the subject when those references must remain.

Classic and custom accent colors are Free. Personalized backgrounds and flashcards use the trusted `backgrounds` and `flashcards` entitlement flags for Pro and Team. Both full document writes and isolated preference writes enforce these checks in SQL. Background images are bounded data URLs for PNG, JPEG, or WebP, with validated overlay and blur ranges; uploaded bytes remain in private preferences. New workspace preferences may inherit the person's Free custom accent but never copy a paid background from another subscription scope. Downgrade preserves existing backgrounds, notes, decks, and cards for reading/export; it blocks new or changed premium content while permitting removal and resetting the background to none.

Owners/admins with Team can choose an organization icon and defaults for focus/break durations, cycle length, planner hours, and first weekday. The server accepts only these seven preferences and a supported icon. On first access, a member's private preferences inherit these defaults and their own existing personal appearance/accessibility/time-zone choices. Paid custom themes and layouts are not copied between subscription scopes. Initialization is idempotent: subsequent administrator changes never overwrite existing private preferences. An explicit Apply defaults control updates only the seven timer/calendar preferences, preserving accessibility, appearance, and any active timer context. All members, including viewers, can save their own preferences through a separate `/api/preferences` endpoint. It accepts no content or timer payload, rechecks membership and scoped entitlements, and uses the same version/conflict and durable operation identity rules. Prepared idle durations may be recalculated from preferences; active sessions remain frozen.

## Sync and data integrity

`GET /api/sync?workspaceId=UUID` returns `{data,version}` with the caller's preferences/timer overlaid. `PUT` accepts `{data,expectedVersion,operationId}`. The document's strict schema contains no roles, plans, entitlements, memberships, or billing claims. Unknown properties and mismatched references fail validation before writes.

Current clients send `X-Folia-Document-Version: 2` on sync and preference requests. Without that capability header, cloud responses retain the previous strict schema: learning fields, subject completion timestamps, and new activity types are omitted, and newer accent names map to a supported legacy color. This applies to success and conflict responses. Hidden learning history and the original newer accent are preserved when an old tab sends its fallback values back. Reload older tabs before editing local caches created by the new app; cloud capability negotiation does not replace code already running in an older offline tab.

The transaction locks the workspace, revalidates permissions and trusted entitlements, compares the version, and records a durable operation ID and payload hash. A retry of the same operation is idempotent; reusing an ID for other content fails. Version conflicts return HTTP 409 with the cloud document and version. The client preserves pending local content for explicit review. It never silently overwrites a conflicting device.

Migration 0008 extends the existing transaction with normalized learning projections and retains compatibility with older clients. Omitted learning collections, accent colors, and backgrounds preserve their current server values; explicit empty collections remove the author's records. Legacy documents that omit `noteSheets` also preserve omitted subject completion timestamps. Modern documents can explicitly reopen subjects. A separate hash of the originally submitted payload keeps retries stable when omitted private values have changed since the original commit. Historical operation receipts remain replayable after the upgrade. Apply migration 0008 before deploying the learning-feature API.

Editable entities have normalized relational projections written in the same transaction as the JSON document. Composite workspace foreign keys protect subjects, projects, tasks, and plans. A PostgreSQL exclusion constraint rejects overlapping planned intervals for one person across all workspaces, while permitting different members to plan the same time. Focus sessions use globally unique identities, immutable JSON snapshots, and an exclusion constraint rejecting overlapping completed focus intervals for the same account. Conflicting offline completions are retained locally and surface as conflicts.

Per-user active timer rows prevent simultaneous timers across workspaces. Replacing an active timer requires recording its conclusion. Duration, start timestamp, phase, and context are frozen, including when the completion is written. Prepared idle phases and cycle counts persist privately. A task deletion cannot cascade-delete focus history because historical snapshots have no current task/subject foreign key. Saved focus and activity records cannot be removed or changed through document synchronization. Journal edits must append the previous content to revision metadata.

Document writes have a 2 MB API limit and serialize at workspace level. Migration 0009 adds compact `PATCH` transactions for large saves, with immutable receipts tied to actor, expected version and normalized payload. Paged `GET` reads require a consistent version and never expose a partial snapshot. Compact conflicts return the version; the client reads the complete version-consistent snapshot for explicit resolution. The server still loads and projects the full document, and the browser retains it locally. Large new imports and individual records can still exceed request or local-storage limits; there is no staged upload or automatic pruning. See [product-update.md](product-update.md) for exact transfer behavior. Downgrade never deletes data.

Advanced cloud reports use `/api/analytics`, which authenticates membership and checks the trusted `advancedAnalytics` entitlement before reading permitted workspace data. It validates date/subject/project/member filters, uses the caller's stored time zone, clips planned intervals at calendar boundaries, and counts only completed focus sessions. Personal Pro reports are forced to the caller's activity; Team reports can select permitted current/former workspace members. Estimates remain separate from completed effort, and deleted-task history remains in aggregate totals. Basic heatmaps and totals remain available on Free. The software-development template uses `/api/templates` with an allowlisted template key and the trusted `advancedTemplates` entitlement; basic templates remain local. Both paid read operations use rate limits and `private, no-store` responses. Local/demo previews do not assert paid cloud access.

Cloud study starts use `GET /api/flashcards/study?workspaceId=UUID&deckId=UUID`. The server authenticates current membership and paid access, validates the selected deck, and reads one committed workspace snapshot through the caller's normal RLS client. A single snapshot avoids silently truncating decks at database row pagination limits. The endpoint is rate limited and returns `private, no-store`. Reading/exporting stored cards remains available after downgrade; the cloud study interaction requires paid access. Local/demo study is an explicitly labeled preview.

## Invitations and account deletion

Owners/admins generate a shareable invitation URL and may explicitly request email delivery when a verified sender is configured. Sending is rate limited; provider acceptance is not presented as confirmed receipt, and failures preserve the shareable link. See [invitations.md](invitations.md) for server-only configuration and delivery states. The database stores only a SHA-256 token hash. Invitations expire after seven days, can be revoked, require the invited verified email, and cannot be replayed. Acceptance checks current Team entitlement and member limits inside the workspace transaction. Role changes, invitations, and ownership transfer produce audit records. Owners cannot be removed or demoted without deliberate transfer; transfer also moves the organization's lifecycle ownership.

Account deletion requires the exact confirmation `DELETE`, a login within ten minutes, and same-origin authentication. Owned organizations must first be transferred. Personal workspace data and preferences are deleted with the account. Contributions already shared with organizations remain attributed to a pseudonymous UUID; separate personal content is never copied into organizations. The database guards against orphaned ownership or deleting a scope with an active subscription.

Before deleting a Stripe customer-backed account, the server acquires a billing lock, fences new checkout, checks current Stripe subscriptions, expires open checkout sessions, checks again, and clears durable checkout references. If a network failure leaves a deletion fence, retry account deletion after reconnecting. Active subscriptions must finish before deletion; cancellation at period end retains data and paid access until then. Export first if you want a portable copy.

## Request and deployment controls

Authenticated mutations require an exact same-origin `Origin` and reject cross-site Fetch Metadata. Configure `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin in deployment. Bodies require JSON and have explicit size bounds. Sensitive account, invitation, synchronization, and billing operations use a durable PostgreSQL rate limiter. Supabase's own authentication rate limits and abuse controls still need deployment configuration. Never log tokens, request bodies, passwords, or unnecessary personal data.

Missing Supabase/server credentials return honest 503 configuration errors. The local/demo experience is independent; local data is uploaded only after an explicit consent action. The service worker does not cache authenticated or billing API responses. See the offline documentation for device cache scope and sign-out behavior.

## Reproducible database checks

These tests run against an isolated PostgreSQL runtime, with minimal Auth role/function fixtures. They exercise actual migrations, constraints, grants, row-level policies, transaction behavior, and trusted billing RPCs. They do not prove hosted Supabase email delivery, SSR authentication, Storage service behavior, actual Stripe Checkout, webhook delivery, or authenticated browser-to-browser synchronization.

Without Docker, use the pinned [PGlite PostgreSQL WASM runtime](https://pglite.dev/docs/about). Its bundled [pgcrypto and btree_gist extensions](https://pglite.dev/extensions/) execute the same migrations in memory. Installation is limited to the ignored `.local/sql-harness` directory and does not change application dependencies, start a network service, or contact a database:

```powershell
npm install --prefix .local/sql-harness --ignore-scripts --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
node scripts/verify-database.mjs
```

The runner applies every migration in lexical order, then all SQL test suites. It omits only psql client directives (`\\set`, `\\i`) and reports the actual `PASS:` assertion count. Fixtures roll back and the memory database is discarded afterward. CI runs this command before the production build. This runtime uses PostgreSQL 18.3; the Docker alternative below uses PostgreSQL 17.11. PGlite has one connection, so this does not test races between simultaneous database connections. The test bootstrap has no Storage schema: migration 0010's hosted bucket/policy branch is intentionally skipped, while catalog constraints, privileges, and paid audio entitlements are exercised.

Docker alternative:

```powershell
docker compose -p folia-security-test -f supabase/docker-compose.test.yml up -d --wait
docker compose -p folia-security-test -f supabase/docker-compose.test.yml exec -T postgres psql -U postgres -d folia_test -f /workspace/tests/bootstrap.sql -f /workspace/tests/security.sql -f /workspace/tests/billing-security.sql -f /workspace/tests/organization-settings.sql -f /workspace/tests/preferences.sql -f /workspace/tests/learning-security.sql -f /workspace/tests/incremental-sync.sql -f /workspace/tests/audio-security.sql
docker compose -p folia-security-test -f supabase/docker-compose.test.yml down --volumes
```

Run bootstrap only on a new, empty test database. The compose file has no host database port and does not touch existing containers. Database tests roll back their fixture records. For hosted deployment, apply `supabase/migrations/*.sql` in lexical order through the Supabase CLI or migration tooling; do not apply the test Auth bootstrap to a real Supabase project.

Primary integration references: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [database functions](https://supabase.com/docs/guides/database/functions).
