# Account signup policy: activation and verification

The hosted SQL function `public.folia_before_user_created(jsonb)` checks new
signup declarations for an age band of 16–17 or 18+, accepted terms/privacy and
the current policy versions. It does not verify age or parental consent.
Existing users explicitly accept through `/api/account/consent`.

## Confirmed hosted state — October 28, 2026

The matching web release is live at `www.solace-pomodoro.com`. Hook preview,
application and an independent verification all succeeded. The hosted hook is
**enabled** at the exact URI
`pg-functions://postgres/public/folia_before_user_created`.

- Only `auth.hook.before_user_created.enabled` and
  `auth.hook.before_user_created.uri` were declared as changes; application made
  one Auth configuration write. The protected Auth snapshot, including SMTP and
  redirects, remained unchanged. Independent verification made **zero writes**
  and reported no configuration changes.
- The deployed readiness marker matched the exact project, metadata schema,
  minimum age and terms/privacy versions. Direct hosted pure-function checks
  accepted the 16–17 and adult declarations, and rejected under-16, missing and
  unaccepted declarations.
- Dry browser checks of the actual deployed signup UI confirmed neutral age
  selection, no identity form for under-16s and an explicit legal checkbox.
  No Auth signup, account or email was created by these checks.

**End-to-end new signup/email confirmation remains owner QA** on the matching web
and installed native builds. These results do not establish verified age,
parental authorization, email delivery, finalized policies or store approval.
The final full unit suite passed 779 tests in 64 files; the isolated SQL suite
passed 516 assertions across 15 migrations and 12 suites.

## Recheck or apply after a reviewed change

The reviewed migration and the function's `supabase_auth_admin` execution grant
are applied. Keep the matching web signup UI deployed before any later hook
change. Older native builds that omit the metadata cannot create accounts with
this hook enabled; use the matching updated native build for signup QA. A normal
readback should use `--verify`; an already matching hook needs no further write.

From the repository root on the existing Windows x64 setup:

```powershell
node scripts/configure-account-signup-hook.mjs --preview
node scripts/configure-account-signup-hook.mjs --apply
node scripts/configure-account-signup-hook.mjs --verify
```

`--preview` is the default and makes no configuration writes. `--apply` changes
only these two values:

```toml
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/folia_before_user_created"
```

The helper pins CLI **2.122.0** and project **`zwgjauskorkpucuaqvgs`**. It defaults
to the existing `.local/mobile-auth/solace-profile.yaml` endpoint profile and
`.local/mobile-auth/cli-home` login state. It does not load `.env.local` or accept
credentials as command arguments. Override executable/profile/home paths with
`--cli`, `--profile`, `--cli-home`, or the corresponding
`SOLACE_SUPABASE_CLI`, `SOLACE_SUPABASE_PROFILE`, `SOLACE_SUPABASE_CLI_HOME`
environment settings. The project and Management API endpoint remain pinned.
Run `--help` to inspect usage without any provider calls.

Before applying or verifying, the helper fetches the no-store production endpoint
`https://www.solace-pomodoro.com/api/account/signup-readiness` without redirects.
Its exact project, metadata schema, minimum online age and legal versions must
match this release. The endpoint derives its public project from the configured
public Supabase URL. This provides deployment evidence; still check that the
actual signup form displays and submits the intended declarations.

The helper uses sparse temporary config and rejects declared changes outside the
two hook fields. It compares CLI-visible protected Auth snapshots before and
after, including SMTP/redirect settings, and compares independent disabled/URI
probes for readback. Secret values stay masked; raw CLI/Auth output is never
printed or saved. Protected snapshots exist only in memory. It never declares
SMTP, hook secrets, redirect, token or email-template settings. An already matching
hook is verified without another push. Another active hook is not automatically
replaced; its policy needs deliberate composition.

If application reports a timeout or a failed post-write check, use `--verify`
before retrying. A write may already have happened. The script never restores an
entire old Auth configuration over concurrent changes. A successful verification
does not prove email delivery, installed-device behavior or all signup paths.
Use authorized disposable test data for those separate checks; this helper does
not create an account or send email.

The configuration follows [Supabase's before-user-created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
and [Postgres hook URI format](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-hooks).
The Management API calls the corresponding settings
`hook_before_user_created_enabled` and `hook_before_user_created_uri`; no hook
secret is needed for a Postgres function. See [Auth configuration fields](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
