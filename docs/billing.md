# Test-mode billing and entitlements

Folia uses Stripe-hosted Checkout and the Customer Portal. This version deliberately rejects live secret keys and live events in every environment. No card details enter Folia. Without credentials, pricing shows an unavailable state and the separate local/demo application remains usable. Opening a successful checkout return URL never grants access.

## Setup

1. Apply every migration in `supabase/migrations` in filename order. Migration `0002_billing.sql` creates billing tables, server-only writes, entitlement policy, fenced workspace locks, and atomic webhook receipts. The Supabase service-role key must be available only to the Next.js server.
2. In a Stripe sandbox/test account, create separate Pro and Team products, each with an active monthly and yearly recurring Price. Use licensed, flat, per-unit billing, quantity one, and a single currency per Price. Fill the four `STRIPE_*_PRICE_ID` variables in `.env.local`. Unset intervals are unavailable; there are no fallback prices or discount claims. Price amounts, currency, and intervals are retrieved from Stripe using its official SDK.
3. Set `STRIPE_SECRET_KEY` to a test secret, and `NEXT_PUBLIC_APP_URL` to your canonical origin. Only HTTPS origins or HTTP localhost are accepted. All checkout/portal returns use the fixed billing destination under that origin; client URLs, customer IDs, amounts, and raw Price IDs are rejected.
4. Create two **test Customer Portal configurations**. Enable invoice history, payment-method updates, and cancellation at the end of the current billing period. Allow price changes only between the Pro monthly/yearly Prices in the Pro configuration and the Team Prices in the Team configuration. Do not allow quantity changes. Set `STRIPE_PRO_PORTAL_CONFIGURATION_ID` and `STRIPE_TEAM_PORTAL_CONFIGURATION_ID`. The server checks these restrictions when opening the portal. Plan changes use Stripe's configured prorations and payment behavior; review these settings before testing. No seats are billed separately.
5. Run Next.js, then run the Stripe CLI:

   ```sh
   stripe login
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

   Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET` and restart Next.js. Use the CLI signing secret locally; a deployed endpoint has its own signing secret.

6. For deployment, register `https://YOUR-ORIGIN/api/billing/webhook` in the same Stripe sandbox. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`, and `invoice.marked_uncollectible`. Use an API version compatible with the installed SDK (the integration retrieves current typed resources rather than trusting historical event snapshots).

Folia requires a Node-capable Next.js deployment plus Supabase and a reachable webhook. Static-only hosting cannot run this integration. Configure Stripe's option to limit customers to one subscription as an additional provider-side guard. Folia also uses durable checkout attempts, a per-workspace lock, stable idempotency keys, reuse/expiration of open sessions, and a current subscription lookup before creating checkout.

## Scope and authority

Each subscription belongs to one workspace. Pro can upgrade only a personal workspace; Team can upgrade only an organization. Team membership never upgrades a member's separate personal workspace. Only the workspace owner can create checkout/portal sessions or read invoice links. Administrators, members, and viewers can read their workspace's effective entitlements but cannot manage billing. Billing routes authenticate users, require membership/owner permissions, validate same-origin mutations, and apply persistent rate limits.

Account deletion requires recent authentication and is blocked until organization ownership is transferred and all subscriptions have ended. The deletion route fences new checkout, verifies Stripe's current state, expires any open Checkout sessions, and verifies subscriptions again before removing the account. This also covers subscriptions created before their webhook arrives. If a worker's lease expires during deletion, a retained `deletion_pending` fence blocks checkout; retry account deletion after reconnecting to resolve it. Database triggers independently protect ownership and pending billing. Deleted personal productivity data cannot be recovered through Folia; export it first.

The server creates a dedicated Stripe customer and persists its unique workspace association before creating any subscription. Webhooks resolve scope using this trusted database relationship. Client metadata, import data, local storage, checkout query parameters, and subscription metadata are never sufficient authority. Premium mutations use the database `workspace_entitlements` function and its canonical server-owned policy.

## Entitlement policy

The canonical deployed limits and grace/trial policy are the singleton `public.billing_policy.config` row. Update it with a reviewed database migration using the service role; clients have no write permission. `src/lib/billing/config.ts` contains equivalent defaults for the disconnected preview only.

| Effective plan |  Subjects |     Tasks |  Projects | Members | Extra features                                                                    |
| -------------- | --------: | --------: | --------: | ------: | --------------------------------------------------------------------------------- |
| Free           |        10 |       100 |         5 |       1 | Core timer, planner, standard themes, basic history and analytics                 |
| Pro            | Unlimited | Unlimited | Unlimited |       1 | Custom themes, saved layouts, advanced templates and analytics                    |
| Team           | Unlimited | Unlimited | Unlimited |      25 | Pro features in the organization, invitations, roles, assignments, team analytics |

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

With actual sandbox credentials, test the owner journey through Checkout, webhook provisioning, refresh on another signed-in device, portal interval changes, renewal, failed-payment recovery, cancellation, and expiration. Use Stripe test cards/test clocks; do not use real cards. Resend the same event and then an older event to verify database receipts and final entitlements. Test concurrent checkout clicks and API calls as non-owners. Verify a wrong signature yields 400 and no durable state mutation. This external flow remains unverified until credentials and a Supabase project are connected.

Official integration references: [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create), [Customer Portal sessions](https://docs.stripe.com/api/customer_portal/sessions/create), [webhook signatures, retries, duplicates, and ordering](https://docs.stripe.com/webhooks?lang=node), [subscription payment states](https://docs.stripe.com/billing/subscriptions/overview), [invoice line periods](https://docs.stripe.com/api/invoice-line-item/object), [subscription item periods](https://docs.stripe.com/api/subscription_items/object), [preventing duplicate subscriptions](https://docs.stripe.com/payments/checkout/limit-subscriptions), [billing test tools](https://docs.stripe.com/billing/testing), and [currency amount conventions](https://docs.stripe.com/currencies).
