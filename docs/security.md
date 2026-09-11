# Security, privacy, and synchronization

Folia uses Supabase Auth and PostgreSQL. Browser clients hold a publishable key; the service-role key and Stripe secret are server-only. API authentication calls `auth.getUser()` rather than trusting cookie contents. Supabase SSR refreshes cookies through the Next.js proxy. Provider email confirmation and password-recovery redirects must be configured for the deployed origin.

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

Owners/admins with Team can choose an organization icon and defaults for focus/break durations, cycle length, planner hours, and first weekday. The server accepts only these seven preferences and a supported icon. On first access, a member's private preferences inherit these defaults and their own existing personal appearance/accessibility/time-zone choices. Paid custom themes and layouts are not copied between subscription scopes. Initialization is idempotent: subsequent administrator changes never overwrite existing private preferences. An explicit Apply defaults control updates only the seven timer/calendar preferences, preserving accessibility, appearance, and any active timer context. All members, including viewers, can save their own preferences through a separate `/api/preferences` endpoint. It accepts no content or timer payload, rechecks membership and scoped entitlements, and uses the same version/conflict and durable operation identity rules. Prepared idle durations may be recalculated from preferences; active sessions remain frozen.

## Sync and data integrity

`GET /api/sync?workspaceId=UUID` returns `{data,version}` with the caller's preferences/timer overlaid. `PUT` accepts `{data,expectedVersion,operationId}`. The document's strict schema contains no roles, plans, entitlements, memberships, or billing claims. Unknown properties and mismatched references fail validation before writes.

The transaction locks the workspace, revalidates permissions and trusted entitlements, compares the version, and records a durable operation ID and payload hash. A retry of the same operation is idempotent; reusing an ID for other content fails. Version conflicts return HTTP 409 with the cloud document and version. The client preserves pending local content for explicit review. It never silently overwrites a conflicting device.

Editable entities have normalized relational projections written in the same transaction as the JSON document. Composite workspace foreign keys protect subjects, projects, tasks, and plans. A PostgreSQL exclusion constraint rejects overlapping planned intervals for one person across all workspaces, while permitting different members to plan the same time. Focus sessions use globally unique identities, immutable JSON snapshots, and an exclusion constraint rejecting overlapping completed focus intervals for the same account. Conflicting offline completions are retained locally and surface as conflicts.

Per-user active timer rows prevent simultaneous timers across workspaces. Replacing an active timer requires recording its conclusion. Duration, start timestamp, phase, and context are frozen, including when the completion is written. Prepared idle phases and cycle counts persist privately. A task deletion cannot cascade-delete focus history because historical snapshots have no current task/subject foreign key. Saved focus and activity records cannot be removed or changed through document synchronization. Journal edits must append the previous content to revision metadata.

Document writes currently have a 2 MB API limit and serialize at workspace level. This is a deliberate small-workspace implementation. Large organizations and long histories require paginated entity synchronization before this limit is reached. Clients always retain read/export access; no downgrade deletes data.

Advanced cloud reports use `/api/analytics`, which authenticates membership and checks the trusted `advancedAnalytics` entitlement before reading permitted workspace data. It validates date/subject/project/member filters, uses the caller's stored time zone, clips planned intervals at calendar boundaries, and counts only completed focus sessions. Personal Pro reports are forced to the caller's activity; Team reports can select permitted current/former workspace members. Estimates remain separate from completed effort, and deleted-task history remains in aggregate totals. Basic heatmaps and totals remain available on Free. The software-development template uses `/api/templates` with an allowlisted template key and the trusted `advancedTemplates` entitlement; basic templates remain local. Both paid read operations use rate limits and `private, no-store` responses. Local/demo previews do not assert paid cloud access.

## Invitations and account deletion

Owners/admins generate a shareable invitation URL; Folia does not send invitation emails automatically. The database stores only a SHA-256 token hash. Invitations expire after seven days, can be revoked, require the invited verified email, and cannot be replayed. Acceptance checks current Team entitlement and member limits inside the workspace transaction. Role changes, invitations, and ownership transfer produce audit records. Owners cannot be removed or demoted without deliberate transfer; transfer also moves the organization's lifecycle ownership.

Account deletion requires the exact confirmation `DELETE`, a login within ten minutes, and same-origin authentication. Owned organizations must first be transferred. Personal workspace data and preferences are deleted with the account. Contributions already shared with organizations remain attributed to a pseudonymous UUID; separate personal content is never copied into organizations. The database guards against orphaned ownership or deleting a scope with an active subscription.

Before deleting a Stripe customer-backed account, the server acquires a billing lock, fences new checkout, checks current Stripe subscriptions, expires open checkout sessions, checks again, and clears durable checkout references. If a network failure leaves a deletion fence, retry account deletion after reconnecting. Active subscriptions must finish before deletion; cancellation at period end retains data and paid access until then. Export first if you want a portable copy.

## Request and deployment controls

Authenticated mutations require an exact same-origin `Origin` and reject cross-site Fetch Metadata. Configure `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin in deployment. Bodies require JSON and have explicit size bounds. Sensitive account, invitation, synchronization, and billing operations use a durable PostgreSQL rate limiter. Supabase's own authentication rate limits and abuse controls still need deployment configuration. Never log tokens, request bodies, passwords, or unnecessary personal data.

Missing Supabase/server credentials return honest 503 configuration errors. The local/demo experience is independent; local data is uploaded only after an explicit consent action. The service worker does not cache authenticated or billing API responses. See the offline documentation for device cache scope and sign-out behavior.

## Reproducible database checks

These tests run only against an isolated Docker PostgreSQL database, with minimal Auth role/function fixtures. They exercise actual migrations, constraints, grants, row-level policies, transaction behavior, and trusted billing RPCs. They do not prove hosted Supabase email delivery, SSR authentication, actual Stripe Checkout, webhook delivery, or authenticated browser-to-browser synchronization.

```powershell
docker compose -p folia-security-test -f supabase/docker-compose.test.yml up -d --wait
docker compose -p folia-security-test -f supabase/docker-compose.test.yml exec -T postgres psql -U postgres -d folia_test -f /workspace/tests/bootstrap.sql -f /workspace/tests/security.sql -f /workspace/tests/billing-security.sql -f /workspace/tests/organization-settings.sql -f /workspace/tests/preferences.sql
docker compose -p folia-security-test -f supabase/docker-compose.test.yml down --volumes
```

Run bootstrap only on a new, empty test database. The compose file has no host database port and does not touch existing containers. Database tests roll back their fixture records. For hosted deployment, apply `supabase/migrations/*.sql` in lexical order through the Supabase CLI or migration tooling; do not apply the test Auth bootstrap to a real Supabase project.

Primary integration references: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [database functions](https://supabase.com/docs/guides/database/functions).
