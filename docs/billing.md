# Test-mode billing and entitlements

The new September 21 installation at `https://solace-hikmagitz.vercel.app` has **no Stripe configuration**. Its new Supabase database has no imported subscriptions or customer records. The September 16 resource IDs and successful sandbox checks below belong only to the separate, unchanged `folia-ennearock` installation. Do not copy its credentials or assume this new site's checkout is active. See [installation-hikmagitz.md](installation-hikmagitz.md).

Solace uses Stripe-hosted Checkout and the Customer Portal. This version deliberately rejects live secret keys and live events in every environment. No card details enter Solace. Without credentials, pricing shows an unavailable state and the separate local/demo application remains usable. Opening a successful checkout return URL never grants access.

## Approved live prices — not activated

On September 21, the owner approved the launch prices: **Free at EUR 0**, **Pro at EUR 3.99/month**, or **Pro at EUR 29.99/year** (one annual payment, approximately EUR 2.50/month). For later Stripe provisioning, the Pro amounts are respectively **399** and **2999** EUR minor units, with quantity one and recurring intervals `month` and `year`. Approval of these prices does not mean they have been created or activated in Stripe. Keep Team unavailable until its offering and hosted purchase journey are validated. Tax treatment and seller information also need confirmation before publication.

This is an accessible launch positioning, not a profitability forecast. For comparison, [Todoist lists EUR 7/month or EUR 60/year](https://www.todoist.com/fr/help/todoist/billing/todoist-pro-pricing-update-in-2025-bxBvHZuJZ), while [TickTick lists USD 49.99/year](https://ticktick.com/upgrade). Prices were checked on September 21, 2026; these products and currencies are not directly equivalent.

The replacement restricted live key is now recognized by Stripe, but the read-only account check returns **HTTP 403 / more_permissions_required**: **Accounts Read (`connected_account_read`)** must be enabled on this key. The earlier HTTP 401 authentication failure no longer occurs with the replacement. Other permissions and account readiness remain unverified. The Vercel team API still reports `hobby`. No live resource, subscription, payment, or deployment was created. Adjust the existing key's permissions privately; do not commit it or paste it into chat. Other launch prerequisites remain:

- The current installation is on Vercel Hobby, which is [restricted to personal non-commercial use](https://vercel.com/docs/plans/hobby). Choose a commercially permitted hosting plan before selling; approval of the customer prices does not authorize a paid hosting upgrade.
- Implement and verify explicit test/live separation in server validation, persisted billing state, SQL entitlements and UI notices. Do not merely remove the live-key rejection or reuse the old site's test subscriptions.
- Configure and verify account confirmation/recovery e-mails, publish seller/support and policy information, and validate the new site's paid subscription lifecycle. Follow [Stripe's go-live checklist](https://docs.stripe.com/get-started/checklist/go-live).
- Do not promote the unavailable hosted audio catalogue as a paid benefit; publish licensed content and verify it first, or remove the upgrade promise.

## Selected first sandbox offering

On September 16, 2026, the product owner selected **Pro at EUR 1.00 per month**, starting with test checkout. Configure one product named **Solace Pro** and an active sandbox Price with `currency: eur`, `unit_amount: 100`, and `recurring.interval: month`. Use flat, licensed, per-unit billing at quantity one, with no trial. Set its actual provider-generated ID as `STRIPE_PRO_MONTH_PRICE_ID`.

Only this monthly Pro offering is selected. Leave the yearly and Team Price variables unset until those offerings are chosen. Create the Pro portal configuration with invoice history, payment-method updates, and cancellation at period end. With one offered Price, subscription price updates may remain disabled.

The dedicated **Solace** Supabase project (`xtvgadjobeecjwgzqwpp`, Paris, Free plan) is connected to the hosted app. All eight application migrations are applied; hosted checks verified the permissions on all 25 application tables and 15 RPCs. Sign-in redirects point to the production origin below. Credentials remain outside Git and are configured in Vercel.

The sandbox resources are now connected: product `prod_VGsH4ozq2NO2RA`, monthly Price `price_1UGKXNEwKDyxQzaigujOGCzV`, Pro portal configuration `bpc_1UGKXOEwKDyxQzaipwj9feBd`, and webhook endpoint `we_1UGKXOEwKDyxQzaiTCOC6MUM`. These are non-secret test resource IDs. The webhook uses API version `2026-08-26.dahlia` and the 13 snapshot event types listed below. Signing and API secrets are stored privately and in Vercel's server-only environment.

The deployed pricing endpoint reports `configured: true`, `mode: "test"`, `currency: "eur"`, `unitAmount: 100`, and `checkoutAvailable: true` for the single monthly Pro offering. The UI reads the provider's Price; it has no hardcoded price fallback. An unsigned webhook request was rejected with HTTP 400. The hosted owner journey also passed: an actual sandbox Checkout payment, natural signed `invoice.paid` provisioning of Pro, duplicate-event handling, and portal cancellation with the end date displayed and paid access retained. See the [verification record](verification.md) for the exact coverage and cleanup.

## Activate the hosted checkout

For the new installation, the application origin is `https://solace-hikmagitz.vercel.app`. In the Vercel project **solace-hikmagitz**, open Settings → Environment Variables and set the following in **Production**, then redeploy. Use the actual account/project values and resources from the selected Stripe test account, not assumed copies of the historical IDs above. Do not commit secrets or paste them into a chat. These steps enable **test checkout**, including on the hosted application.

| Variable                                                  | Required value                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                                     | `https://solace-hikmagitz.vercel.app`                                    |
| `NEXT_PUBLIC_SUPABASE_URL`                                | The connected Supabase project URL                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                    | That project's publishable key (or use `NEXT_PUBLIC_SUPABASE_ANON_KEY`)  |
| `SUPABASE_SERVICE_ROLE_KEY`                               | Server-only key for the same migrated project                            |
| `STRIPE_SECRET_KEY`                                       | A secret key from the selected Stripe sandbox/test account               |
| `STRIPE_WEBHOOK_SECRET`                                   | The signing secret for the hosted endpoint below, from that same sandbox |
| `STRIPE_PRO_MONTH_PRICE_ID`, `STRIPE_PRO_YEAR_PRICE_ID`   | Actual Pro recurring Price IDs for the intervals you offer               |
| `STRIPE_TEAM_MONTH_PRICE_ID`, `STRIPE_TEAM_YEAR_PRICE_ID` | Actual Team recurring Price IDs for the intervals you offer              |
| `STRIPE_PRO_PORTAL_CONFIGURATION_ID`                      | Safe Pro customer portal configuration, `bpc_…`                          |
| `STRIPE_TEAM_PORTAL_CONFIGURATION_ID`                     | Safe Team customer portal configuration, `bpc_…`                         |

Register a separate Stripe webhook at **`https://solace-hikmagitz.vercel.app/api/billing/webhook`**. Set the events listed under Setup. Do not modify the old site's webhook. The Stripe CLI's local signing secret will not verify deliveries from this hosted endpoint. API keys and webhook signing secrets are separate credentials. No Stripe publishable key is needed for this hosted redirect integration. [Stripe API keys](https://docs.stripe.com/keys)

At least one real configured recurring Price is needed; you may launch Pro without configuring Team. Choose amounts and currency in Stripe before activation. Folia does not invent a subscription price, annual discount, or paid checkout URL. Missing Supabase credentials, the webhook secret, or all Prices leave checkout unavailable. A missing portal disables checkout for its tier; a portal that fails the server's checks is rejected before creating a customer or Checkout session.

After redeployment, visit `https://solace-hikmagitz.vercel.app/api/billing/prices`. Expect `configured: true`, `mode: "test"`, the exact Stripe amounts, and `checkoutAvailable: true` for each offered tier. This checks configuration and Price retrieval; it does **not** prove delivery of a signed webhook. Complete the owner journey below to verify payment, provisioning and cancellation. The billing page directs local users to sign in, lets owners select the matching workspace, and keeps Free colors and notes available while checkout is unconfigured.

Real payments require an activated Stripe account and a deliberately enabled, reviewed live-mode deployment. This build currently rejects live mode, so replacing `sk_test_…` with `sk_live_…` is insufficient. A future live-mode change must validate the mode of keys, Prices, portals, subscriptions, invoices and webhook events, and isolate existing test billing records from live entitlements. It also needs live products/Prices, live portal configurations, a live endpoint signing secret and the production origin. [Stripe go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)

## Setup

1. Apply every migration in `supabase/migrations` in filename order. Migration `0002_billing.sql` creates billing tables, server-only writes, entitlement policy, fenced workspace locks, and atomic webhook receipts. The Supabase service-role key must be available only to the Next.js server.
2. In a Stripe sandbox/test account, create the selected **Solace Pro** monthly Price at **EUR 1.00** and fill `STRIPE_PRO_MONTH_PRICE_ID` in `.env.local`. Use licensed, flat, per-unit billing, quantity one, and a single currency per Price. Additional yearly or Team offerings can use their corresponding `STRIPE_*_PRICE_ID` variables later; leave those unset for this first verification. Unset intervals are unavailable; there are no fallback prices or discount claims. Price amounts, currency, and intervals are retrieved from Stripe using its official SDK.
3. Set `STRIPE_SECRET_KEY` to a test secret, and `NEXT_PUBLIC_APP_URL` to your canonical origin. Only HTTPS origins or HTTP localhost are accepted. All checkout/portal returns use the fixed billing destination under that origin; client URLs, customer IDs, amounts, and raw Price IDs are rejected.
4. Create two **test Customer Portal configurations** (or only the configuration for the tier you offer). Enable invoice history, payment-method updates, and cancellation at the end of the current billing period. Allow price changes only between the Pro monthly/yearly Prices in the Pro configuration and the Team Prices in the Team configuration. Do not allow quantity changes. Set `STRIPE_PRO_PORTAL_CONFIGURATION_ID` and `STRIPE_TEAM_PORTAL_CONFIGURATION_ID`. The server checks these restrictions **before checkout and when opening the portal**. Plan changes use Stripe's configured prorations and payment behavior; review these settings before testing. No seats are billed separately. [Stripe portal settings](https://docs.stripe.com/customer-management/configure-portal)
5. Run Next.js, then run the Stripe CLI:

   ```sh
   stripe login
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

   Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET` and restart Next.js. Use the CLI signing secret locally; a deployed endpoint has its own signing secret.

6. For deployment, register `https://YOUR-ORIGIN/api/billing/webhook` in the same Stripe sandbox. Use **snapshot events from this account**, not thin events or a Connect destination: the handler reads `data.object.customer`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`, and `invoice.marked_uncollectible`. Use an API version compatible with the installed SDK (the integration retrieves current typed resources rather than trusting historical event snapshots).

Folia requires a Node-capable Next.js deployment plus Supabase and a reachable webhook. Static-only hosting cannot run this integration. Configure Stripe's option to limit customers to one subscription as an additional provider-side guard. Folia also uses durable checkout attempts, a per-workspace lock, stable idempotency keys, reuse/expiration of open sessions, and a current subscription lookup before creating checkout.

## Scope and authority

Each subscription belongs to one workspace. Pro can upgrade only a personal workspace; Team can upgrade only an organization. Team membership never upgrades a member's separate personal workspace. Only the workspace owner can create checkout/portal sessions or read invoice links. Administrators, members, and viewers can read their workspace's effective entitlements but cannot manage billing. Billing routes authenticate users, require membership/owner permissions, validate same-origin mutations, and apply persistent rate limits.

Account deletion requires recent authentication and is blocked until organization ownership is transferred and all subscriptions have ended. The deletion route fences new checkout, verifies Stripe's current state, expires any open Checkout sessions, and verifies subscriptions again before removing the account. This also covers subscriptions created before their webhook arrives. If a worker's lease expires during deletion, a retained `deletion_pending` fence blocks checkout; retry account deletion after reconnecting to resolve it. Database triggers independently protect ownership and pending billing. Deleted personal productivity data cannot be recovered through Folia; export it first.

The server creates a dedicated Stripe customer and persists its unique workspace association before creating any subscription. Webhooks resolve scope using this trusted database relationship. Client metadata, import data, local storage, checkout query parameters, and subscription metadata are never sufficient authority. Premium mutations use the database `workspace_entitlements` function and its canonical server-owned policy.

## Entitlement policy

The canonical deployed limits and grace/trial policy are the singleton `public.billing_policy.config` row. Update it with a reviewed database migration using the service role; clients have no write permission. `src/lib/billing/config.ts` contains equivalent defaults for the disconnected preview only.

| Effective plan |  Subjects |     Tasks |  Projects | Members | Extra features                                                                                                                                                 |
| -------------- | --------: | --------: | --------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free           |        10 |       100 |         5 |       1 | Core timer/planner, eight classic palettes, personalized accent color, note sheets, basic history and analytics                                                |
| Pro            | Unlimited | Unlimited | Unlimited |       1 | Free features plus four gradient backgrounds, image backgrounds with dim/blur, flashcards, full custom themes, saved layouts, advanced templates and analytics |
| Team           | Unlimited | Unlimited | Unlimited |      25 | Pro features in the organization, invitations, roles, assignments, team analytics                                                                              |

`null` means unlimited. Limits restrict creating additional records and paid-only operations; downgrades never delete data. Existing content remains readable/exportable within membership permissions, and a running focus session can still complete. A free organization may be created with its owner so it can be upgraded; invitations and additional members require Team.

| Trusted state                                                      | Effective access                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Paid subscription invoice with matching allowlisted recurring line | Access through the latest verified line period end (`paid_through`)                      |
| `active` with no verified paid invoice                             | Free; an active label alone does not establish paid coverage                             |
| `incomplete` / pending initial payment                             | Free unless a prior paid period still covers the workspace                               |
| Failed renewal / `past_due`                                        | Preserve paid coverage; optional configured grace after it expires                       |
| `unpaid`, `paused`, cancellation, or expiration                    | Preserve an existing paid period, then Free                                              |
| Cancellation at period end                                         | Paid access until paid coverage expires; no automatic renewal claim                      |
| `trialing`                                                         | Disabled by default; if policy enables trials, access until the trusted Stripe trial end |
| Unknown/wrong-scope Price or multiple active subscriptions         | Reconciliation fails closed for new access and requests operational review               |

`paymentGraceDays` defaults to **0** and applies only to `past_due` after an actual paid period. `allowTrials` defaults to **false**. Checkout does not create trials; an operator can explicitly enable and configure optional Stripe trials. Refund handling, disputed charges, taxes, dunning email content, and legal cancellation terms require deployment-specific policy and review; no legal or tax compliance claim is made here.

Example policy change (execute as a migration, never from a browser):

```sql
update public.billing_policy
set config = jsonb_set(config, '{plans,free,subjects}', '20'::jsonb), updated_at = now()
where id = true;
```

## Durable webhook behavior

Signatures are verified over the exact raw request body using Stripe's SDK and default timestamp tolerance. Verified test event IDs are inserted durably before processing. Processed duplicates return successfully without reapplying state. Failed processing returns HTTP 503, leaving a retryable receipt; Stripe retries or an operator can resend the event. Unrelated event types/customer associations are durably acknowledged without altering workspace access.

Reconciliation takes a three-minute per-workspace database lease, retrieves the customer's current subscriptions, retrieves the selected subscription again, and checks paid invoices/line periods. It never applies the webhook's old subscription snapshot. The fenced commit verifies that the worker still owns an unexpired lease and atomically stores subscription state and marks the event processed. A crash, expired worker, duplicate delivery, or out-of-order old event cannot commit an old snapshot over a newer worker. Every reconciliation reads current Stripe state; no event timestamp ordering assumption is needed. The function checks the ten latest paid invoices and preserves the greatest previously verified coverage; the normal single-plan subscription lifecycle produces a qualifying recent invoice. Unusual manual invoice volume or malformed subscription configurations require operator inspection.

Inspect `billing_events` pending/failed rows from a privileged operational session and resend failed Stripe events after correcting configuration. Receipts retain only event IDs/types/status and generic errors, not full payment payloads. Use a periodic operational alert for old pending/failed records in deployment. The synchronous handler relies on Stripe retries; a dedicated queue worker is a future scaling improvement. It never returns success for a failed reconciliation.

## Validation and remaining external verification

The automated suite covers invalid/tampered signatures, duplicates, retryable failures, receipt durability, out-of-order event handling, trusted customer scope, current resource reconciliation, cancellation and failed-payment paid coverage, grace, disabled trials, foreign-scope plans, duplicate subscription statuses, unavailable billing, forged requests, unauthorized checkout/portal calls, and client amount/paid-flag rejection. Tests run entirely against local code/mocks and do not claim Stripe network verification.

`tests/billing-configuration.test.ts` also checks missing durable cloud configuration, test-mode key and Price enforcement, safe per-tier portal changes, required cancellation/payment recovery/invoices, malformed portal IDs and live/cross-scope/quantity change rejection. The checkout authorization test verifies that unsafe portal setup is refused before taking a billing lock or creating provider resources.

On September 16, 2026, the deployed owner journey passed with the configured EUR 1.00/month sandbox Price. Checkout produced a paid test invoice and active subscription; a natural signed `invoice.paid` event granted Pro, backgrounds and flashcards. Two locally signed replays of that already-processed real event were acknowledged without changing its processed receipt. Portal cancellation scheduled the subscription to end at the current period end; Solace displayed the date and retained paid Pro access. The disposable subscription was then canceled without invoicing/proration, its app account/workspace removed through the guarded deletion flow, and its test customer deleted. No real payment or account email was sent.

Refresh of Pro on another signed-in device, renewal, failed-payment recovery, paid-period expiration, automatic provider redelivery, older-event replay, concurrent Checkout and non-owner calls still need hosted verification. Some concurrent events encountered retryable processing failures while the paid-invoice event successfully provisioned access; automatic recovery was not established. Use Stripe test cards/test clocks for these remaining checks. Portal interval changes are not offered with the single configured monthly Price. Provider email delivery also remains unverified. See [verification.md](verification.md) for the observed results; local/mock coverage is distinct from hosted verification.

Official integration references: [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create), [Customer Portal sessions](https://docs.stripe.com/api/customer_portal/sessions/create), [webhook signatures, retries, duplicates, and ordering](https://docs.stripe.com/webhooks?lang=node), [subscription payment states](https://docs.stripe.com/billing/subscriptions/overview), [invoice line periods](https://docs.stripe.com/api/invoice-line-item/object), [subscription item periods](https://docs.stripe.com/api/subscription_items/object), [preventing duplicate subscriptions](https://docs.stripe.com/payments/checkout/limit-subscriptions), [billing test tools](https://docs.stripe.com/billing/testing), and [currency amount conventions](https://docs.stripe.com/currencies).
