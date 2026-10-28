# Solace authentication email

## Current verification

On October 28, 2026, the installed Android app passed existing-account sign-in,
session restoration after a full restart, personal-workspace cloud saving and
recovery-link handling. The owner also confirmed a successful password change
and sign-in with the new password. New-account signup then returned
`email rate limit exceeded`.

A read-only hosted configuration check confirmed custom SMTP is disabled.
Supabase's built-in mailer has a project-wide limit of two authentication emails
per hour and restricts recipients to project-team addresses. Public signup needs
a dedicated delivery setup. See the official [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
and [rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## Resend prerequisites

The owner selected Resend. Its SMTP integration requires an account, a verified
sending domain and an API key. See [Resend's Supabase guide](https://resend.com/docs/send-with-supabase-smtp).

1. Sign into [Resend](https://resend.com/) and add `solace-pomodoro.com` under
   **Domains** with sending enabled.
2. Add exactly the sending-verification DNS records shown by Resend. The domain
   currently uses Namecheap BasicDNS. Preserve the existing website and root
   mail-routing records; Resend receiving is not required for authentication mail.
   Use the record values from this Resend account rather than example DKIM keys.
3. Wait for Resend to show the sending domain as **Verified**.
4. Create a **Sending access** API key restricted to that domain. Enter it only
   in the local helper's secure terminal prompt.

The initial public DNS check on October 28 found existing root-domain MX records and no
TXT answer for `resend._domainkey.solace-pomodoro.com` or
`send.solace-pomodoro.com`. No DNS records were changed during that check.

The owner subsequently reported Resend Sending as **Verified**. Independent checks
through Cloudflare and Google public resolvers confirmed the DKIM TXT and the
sending CNAMEs: `rsend` points to `rsend-euw1.forge.rmta.net`, and `send` points to
`send.forge.rmta.net`. A fresh local preview passed with zero production writes
and protected Auth settings unchanged. SMTP activation still awaits the locally
entered sending key; delivery has not yet been tested.

## Prepared Supabase configuration

| Setting                    | Planned value                             |
| -------------------------- | ----------------------------------------- |
| Supabase project           | `zwgjauskorkpucuaqvgs` / Solace Hikmagitz |
| SMTP host                  | `smtp.resend.com`                         |
| SMTP port                  | `465`                                     |
| SMTP username              | `resend`                                  |
| SMTP password              | Locally entered Resend sending key        |
| Sender                     | `Solace <noreply@solace-pomodoro.com>`    |
| Authentication email limit | 30 per hour                               |

The prepared helper declares only SMTP settings and the email-sending rate.
The website URL, redirect allowlist, confirmation requirement and other rate
limits are checked separately and preserved. In particular, the verified mobile
callback stays `com.solace.pomodoro://auth/callback`.

## Local setup helper

The ignored `.local/mobile-auth` folder contains the task-specific helpers and
the previously authorized Supabase CLI profile. Run from the project root.

Preview the exact nonsecret configuration first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.local\mobile-auth\setup-resend.ps1
```

After the sending domain is verified, activate it with a local secure key prompt:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.local\mobile-auth\setup-resend.ps1 -Apply
```

If the terminal does not paste correctly into its hidden prompt, use the local
masked key-entry window instead:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\.local\mobile-auth\setup-resend.ps1 -Apply -KeyDialog
```

The window accepts the key through a WPF `PasswordBox.SecurePassword`. Cancel
closes it without running the configuration helper. Neither input mode reads
the clipboard programmatically. Format errors now distinguish terminal control
characters, masked values, missing prefixes and other invalid input using fixed
messages that contain no key characters or length. Format acceptance does not
prove key validity, permissions or delivery.

The wrapper passes the key through its child process environment, clears its
copy afterward and uses an `env()` reference in temporary configuration. It
does not put the key into command arguments, a project env file or the mobile
bundle. Supabase stores the SMTP credential as part of its hosted Auth settings.
The helper previews allowed settings, checks the update result and verifies
nonsecret readback. It prints a nonsecret result in the local terminal.

SMTP activation and successful delivery must be verified before treating this
setup as complete. After activation, retry the pending signup on the phone. If
the earlier attempt already created an unconfirmed account, resend its
confirmation rather than creating another account. Open the confirmation email
on that same installation and verify account/session restoration. Local preview success
alone does not establish email delivery or Resend domain verification.
