# Solace authentication email

## Current verification

On October 28, 2026, the installed Android app passed existing-account sign-in,
session restoration after a full restart, personal-workspace cloud saving and
recovery-link handling. The owner also confirmed a successful password change
and sign-in with the new password. New-account signup then returned
`email rate limit exceeded`.

A read-only hosted configuration check initially confirmed custom SMTP was disabled.
Supabase's built-in mailer has a project-wide limit of two authentication emails
per hour and restricts recipients to project-team addresses. Public signup needs
a dedicated delivery setup. See the official [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
and [rate limits](https://supabase.com/docs/guides/auth/rate-limits).

The owner has now activated Resend SMTP using the local masked key-entry window.
The apply result confirmed the credential was sent and protected Auth settings
were unchanged. An independent read-only check confirmed SMTP is enabled, the
nonsecret settings match the configuration below, and the sending limit is 30
emails per hour.

The owner then reported receiving the signup confirmation email and opening it
on the same Galaxy Note10, which signed them into Solace. Status-only inspection
confirmed the signed-in personal workspace and completed cloud synchronization.
After a full app stop and cold relaunch, the same signed-in, synchronized state
was verified again, with no account error or authentication secrets in the
navigation state. Email contents, input values and session tokens were not read.
The email delivery and link-opening result were owner-reported; device status
and session restoration were independently observed.

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
and protected Auth settings unchanged. The subsequent SMTP activation,
signup delivery result and device verification are recorded above.

## Active Supabase configuration

| Setting                    | Configured value                          |
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

For initial activation or a future credential update, use a local secure key prompt
after verifying the sending domain. The current installation is already active:

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

Check the active nonsecret settings without entering a key or changing configuration:

```powershell
node .\.local\mobile-auth\configure-resend.mjs --verify
```

For future signup delivery checks, use an address that is not already confirmed.
In the installed app, choose **Ouvrir le compte → Créer un compte**, submit once,
and open the newest confirmation email on that same installation. Verify the
signed-in workspace and session restoration after a restart. The app has no
separate resend-confirmation button; repeating signup for an unconfirmed account
requests a fresh confirmation with this installation's PKCE flow. A check-your-email
notice alone does not establish delivery.

This result covers signup on the installed Android debug build. Resend-backed
password-reset delivery, a confirmation link opened while the app is stopped,
and the iOS equivalent remain separate checks. The earlier successful password
recovery test preceded the SMTP change.
