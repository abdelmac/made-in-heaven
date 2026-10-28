# Solace store listing draft

Prepared October 28, 2026. Copy for owner review, not submitted metadata. No rating, approval, screenshot or store purchase is claimed. The app interface is currently French; English listing copy does not establish an English interface localization. Confirm every advertised feature against the final signed build and entitlement rules.

## Identifiers and public contacts

| Field                   | Value / status                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| App name                | Solace                                                                          |
| Android application ID  | `com.solace.pomodoro`                                                           |
| iOS bundle ID in source | `com.solace.pomodoro` — registration/signing still required                     |
| Publisher               | Machta Abdelkader; nickname ennearock; declared country France — owner supplied |
| Support email           | quetzal.hkm@gmail.com — receipt/monitoring check pending                        |
| Privacy                 | https://www.solace-pomodoro.com/privacy                                         |
| Account deletion        | https://www.solace-pomodoro.com/account-deletion                                |
| Support                 | https://www.solace-pomodoro.com/support                                         |
| Terms                   | https://www.solace-pomodoro.com/terms                                           |
| Publisher notice        | https://www.solace-pomodoro.com/legal                                           |

The matching web release is live at the URLs above. Six actual-domain Chrome public/deletion tests passed; HTTP checks confirmed publisher/contact details and disabled checkout. The signup-policy hook is enabled and independently verified; complete new signup/email QA remains an owner task. The policy/legal pages remain provisional drafts with `noindex` metadata: complete [privacy-review.md](privacy-review.md) before submission. Store-specific numeric app IDs, product IDs and Android base-plan IDs have not been supplied; do not invent them. Apple individual enrollment uses legal identity; Google distinguishes display name from verified identity. See [Apple enrollment](https://developer.apple.com/programs/enroll/) and [Google identity requirements](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en).

## Français

**Nom :** Solace

**Sous-titre App Store :** Concentration et organisation

**Description courte Google Play :** Minuteur Pomodoro, tâches, notes et planning, avec un mode local sans compte.

**Description :**

Organisez votre journée et avancez à votre rythme avec Solace. Alternez les périodes de concentration et les pauses grâce au minuteur Pomodoro, préparez vos tâches et retrouvez vos notes au même endroit.

- Préparez vos sessions et votre planning.
- Organisez vos tâches, matières et projets.
- Prenez des notes et consultez votre progression personnelle.
- Utilisez un espace local sans créer de compte.

Un compte en ligne permet de synchroniser vos données et d'accéder aux espaces partagés, selon les droits de votre compte. Les contenus d'une organisation sont visibles par ses membres. Les données locales ne sont pas importées automatiquement dans votre compte.

Les outils locaux sont accessibles à tout âge. Les comptes en ligne et les achats Pro sont réservés aux personnes déclarant avoir au moins 16 ans. Le suivi facultatif de l'humeur et de l'énergie est un outil personnel, sans fonction de diagnostic ni de soin.

Lorsqu'il est disponible, l'abonnement personnel Pro est mensuel et se renouvelle automatiquement sauf résiliation. Il propose notamment les cartes mémoire, la personnalisation et les analyses avancées. L'achat mobile passe par l'App Store ou Google Play : le prix localisé et les conditions sont affichés avant confirmation. Gérez ou arrêtez les renouvellements depuis votre boutique et utilisez la restauration des achats si nécessaire.

Vous pouvez exporter vos données et supprimer votre compte depuis les paramètres ou la page publique de suppression. Supprimer un compte Solace ne résilie pas automatiquement un abonnement Apple ou Google.

Assistance : quetzal.hkm@gmail.com

## English

**Name:** Solace

**App Store subtitle:** Focus and organize your day

**Google Play short description:** Pomodoro timer, tasks, notes and planning, with a local mode without an account.

**Description:**

Plan your day and make progress at your own pace with Solace. Use the Pomodoro timer for focus sessions and breaks, prepare your tasks and keep your notes together.

- Plan focus sessions and organize your schedule.
- Arrange tasks, subjects and projects.
- Take notes and review your personal progress.
- Use a local workspace without creating an account.

An online account enables synchronization and shared workspaces, subject to your account's access rights. Organization content is visible to its members. Local data is not automatically imported into your account.

Local tools are available to all ages. Online accounts and Pro purchases are restricted to people who declare they are at least 16. Optional mood and energy entries are personal records, with no diagnostic or treatment function.

When available, personal Pro is a monthly subscription that renews automatically unless canceled. It includes flashcards, customization and advanced reports. Mobile purchases use the App Store or Google Play, showing the localized price and terms before confirmation. Manage or stop renewals through your store and restore purchases when needed.

Export your data or delete your account from settings or the public deletion page. Deleting a Solace account does not automatically cancel an Apple or Google subscription.

Support: quetzal.hkm@gmail.com

The subtitles and short descriptions above fit the current 30/80-character limits. Keep public copy independent of a fixed euro price; the **owner's catalog target is €1/month**, to configure and verify in each store. [Apple metadata fields](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [Apple product-page guidance](https://developer.apple.com/app-store/product-page/) and [Google listing fields](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en) describe the relevant fields and limits.

## Review notes to adapt after release testing

- Local timer/task/note features can be reviewed without login. The interface is French. Use **Paramètres → Compte** for signup/sign-in. The neutral age choice limits online access to a 16+ declaration; acceptance is recorded by the server. Supply any required non-expiring review account through the stores' private review fields, never this repository.
- **Offres et facturation** uses native billing on iOS/Android. Personal Pro is available only to the signed-in owner of a personal workspace; select that workspace first. Restore and Manage are available when configured. A receipt grants access only after server verification. Store configuration and legal eligibility are required; missing configuration is shown as unavailable. Confirm the actual sandbox review environment before submission.
- **Paramètres → Compte → Supprimer le compte** requires current password and exact `DELETE`. The external deletion URL opens browser sign-in/account settings; it never deletes automatically. Transfer organization ownership first. Web Stripe subscriptions are canceled in this flow; Apple/Google renewals must be stopped separately and do not block immediate deletion.
- Explain optional private mood entries and enabled image/notification permissions accurately. Do not present them as medical functionality, verified age assurance or advertising consent. Final review credentials, contact phone and special instructions belong in private App Review/app-access fields. See [Apple review information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).

## Owner submission checklist

- [ ] Verify developer accounts, legal/trader identity, applicable professional notices, countries, paid-app agreements, payout/tax details and required review contacts. Public postal/phone/business details have not been arranged. Vercel remains Hobby; [Pro commercial hosting preparation](vercel-pro-upgrade.md) is pending, with no upgrade purchase performed. Commercial sales stay closed.
- [ ] Finalize the deployed provisional policies, complete end-to-end signup/email QA with the enabled hook, recheck final public content and verify the support inbox. Hosted mood/deletion/native/legal migrations are applied; hook/readback/pure-function and deployed UI dry checks passed. Those checks created no account/email and do not establish store approval.
- [ ] Create the monthly personal Pro products/base plan for the €1 target, confirm localized prices and renewal/cancellation disclosures, and configure secure server credentials, Apple/Google notifications and reconciliation. Keep production purchases closed until launch gates are satisfied.
- [ ] Test real sandbox purchases, pending approval, cancel/retry, restore after restart, renewal, refund/revocation, account binding and account deletion on supported devices. No Apple/Google purchases were performed in this preparation. Intercepted browser tests do not replace these checks.
- [ ] Complete App Privacy and Data safety from the final binary/provider inventory, including account/legal records, optional moods/images, cloud content, purchase history and technical logs. No forms have been submitted. See [store-readiness.md](store-readiness.md).
- [ ] Complete content-rating and audience questionnaires honestly. **All-ages local access does not establish a 3+/4+ rating or exemption from children's policies.** A Google target audience including children triggers Families requirements; assess Apple's separate Kids Category rules before choosing it. See [Google audience rules](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en), [Apple age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [Apple Kids guidance](https://developer.apple.com/kids/).
- [ ] Produce real release screenshots for the required devices; verify icon, French/English metadata and feature claims; run owner-approved device QA using the [verified signed Android AAB/APK](android-release.md#final-signed-candidate) and preserve the upload-key backup. Finish iOS Xcode signing/archive/device checks, then upload for review. The Android artifacts have not been installed or submitted; no approval is claimed.
