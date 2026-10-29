# Google Play: first internal test

Updated October 29, 2026 for the owner's requested Android package
**`com.solacepomodoro.myapp`**. The earlier October 28 signed build uses a
different package and must not be uploaded to this new Play record. The matching
signed rebuild is now verified; use its package-specific export below.
Nothing in this document creates a store record, uploads a release, enrolls
testers or enables real payments.

## Select the existing app or create its record

Open the existing [Play Console account](https://play.google.com/console).
If Solace already exists, use that record and preserve its existing package and
product identifiers. Otherwise create its app record with these values:

| Field                        | Value                               |
| ---------------------------- | ----------------------------------- |
| App name                     | Solace                              |
| Default language             | French, France (`fr-FR`)            |
| Type                         | App                                 |
| Download price               | Free; Pro is an in-app subscription |
| Android package in the build | `com.solacepomodoro.myapp`          |
| Support email                | `quetzal.hkm@gmail.com`             |

App records and account verification belong to the owner's existing account.
Do not register another developer account or pay the enrollment fee again.
Google's [app setup instructions](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
describe the fields and permanent identifiers.

## Prepare the internal release

Go to **Test and release → Testing → Internal testing → Create new release**.
Configure Play App Signing when prompted. Select the verified matching signed
**AAB**:

```text
C:\project\pomodoro\web\made-in-heaven\.local\exports\solace-com.solacepomodoro.myapp-1.0.0-1-signed.aab
```

The actual package, callback and signature were verified on October 29. The old
`.local/exports/solace-1.0.0-1-signed.aab` contains `com.solace.pomodoro` and is
retained as a historical artifact, not the upload for this record.
The earlier `solace-store-preparation-2026-10-28.zip` contains that same old-ID
build; it is not the new package's upload kit.

Its package is `com.solacepomodoro.myapp`, version **1.0.0**, version code **1**.
Use the next unused code if this app already has an uploaded build. The source
and release-build instructions are in [android-release.md](android-release.md).
Preserve the existing upload identity and complete its owner-controlled portable
backup before relying on it for future uploads. No private signing key belongs
in the store-assets ZIP or a chat message.

Suggested release name: `1.0.0 (1) — Internal test`.
Suggested French notes:

> Première version de test de Solace : minuteur, tâches, planning et notes.
> Vérification de la connexion, de la synchronisation et de la restauration des achats.

The console upload can first be saved as a draft for review. A Billing-enabled
version must actually be published to a track, including internal testing,
before Google's billing-product features become available. An unpublished draft
does not meet that requirement. Use the owner's intended internal tester list;
internal distribution is separate from public production rollout. See
[Billing setup](https://developer.android.com/google/play/billing/getting-ready)
and [internal testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

This new Android package is separate from the owner's existing
`com.solace.pomodoro` debug app. It can have separate app data and sessions; the
rename does not migrate or delete the old installation's local work. Its new
authentication callback is `com.solacepomodoro.myapp://auth/callback`. The old
callback remains for iOS and the older Android installation. Do not uninstall the
owner's debug app as part of this handoff.

## Then create or select the monthly Pro subscription

Under **Monetize with Play → Products → Subscriptions**, keep an existing matching
product if one already exists. If creating the first product, these proposed
identifiers match the intended server configuration:

| Field                 | Proposed new value                                  |
| --------------------- | --------------------------------------------------- |
| Product name          | Solace Pro                                          |
| Product ID            | `solace_pro`                                        |
| Base plan ID          | `monthly`                                           |
| Plan type             | Auto-renewing                                       |
| Billing period        | Monthly (`P1M`), not four weeks                     |
| Trial / special offer | None for this release                               |
| France customer price | Verify the final displayed total is **€1.00/month** |

Product/base-plan IDs are permanent. Existing IDs should be supplied instead of
creating duplicates. Bulk price entry is tax-exclusive and can result in tax or
local price adjustments; entering `1 EUR` there does not by itself prove the
final customer price. Review the French consumer total before activation. The
payments profile and any requested merchant details must be completed in the
owner's account. See [Google subscription setup](https://support.google.com/googleplay/android-developer/answer/140504?hl=en).

## Before a test purchase

- Add the Google account used on the test phone to the internal test and,
  separately, **Settings → License testing**. Internal-test enrollment alone can
  still result in real purchase charges. Confirm the purchase sheet shows a test
  purchase and select **Test card, always approves**.
- Configure the Google verification credentials, product/base plan and signed
  RTDN push identity on Solace's server using the secure settings in
  [publication-owner-actions.md](publication-owner-actions.md). Product IDs are
  nonsecret; the service-account private key belongs only in server secrets.
- Keep the database/environment in sandbox and production-purchase permission
  closed. Test purchase, acknowledgement, restore, renewal, cancellation and
  refund before considering production sales.

See [license testing](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en)
and [Billing test methods](https://developer.android.com/google/play/billing/test).
Publisher/trader details, policy review and the deferred Vercel Pro upgrade remain
separate public paid-launch requirements. Neither an internal build nor a test
purchase establishes store approval.
