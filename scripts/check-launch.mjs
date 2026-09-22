import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  approvedAppOrigin,
  assertStripeSecret,
  billingMode,
  configuredPrices,
  stripeAccountId,
} from '../src/lib/billing/config.ts';
import { getLaunchInformation } from '../src/lib/launch-config.ts';
import { invalidSupabaseVariables } from './validate-env.mjs';

const launchFlags = [
  'STRIPE_LIVE_CHECKOUT_ENABLED',
  'SOLACE_COMMERCIAL_HOSTING_CONFIRMED',
  'SOLACE_AUTH_EMAIL_VERIFIED',
  'SOLACE_LAUNCH_REVIEWED',
];

/** Diagnostics contain fixed labels and booleans only, never environment values. */
export function launchChecks(env) {
  const checks = [];
  const check = (name, operation) => {
    try {
      checks.push({ name, ok: Boolean(operation()) });
    } catch {
      checks.push({ name, ok: false });
    }
  };
  check('Mode Stripe explicite ou test par défaut', () => billingMode(env));
  check('Clé Stripe du mode choisi et compte valide', () => {
    assertStripeSecret(env.STRIPE_SECRET_KEY ?? '', env);
    return true;
  });
  check('Origine canonique valide (HTTPS obligatoire en live)', () => {
    const origin = approvedAppOrigin(env);
    return billingMode(env) === 'test' || origin.startsWith('https://');
  });
  check(
    'Connexion Supabase complète et formats valides',
    () =>
      env.NEXT_PUBLIC_SUPABASE_URL &&
      (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      invalidSupabaseVariables(env).length === 0,
  );
  check('Secret de signature webhook présent', () =>
    /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET ?? ''),
  );
  check('Deux tarifs Pro distincts, Team désactivé pour ce lancement', () => {
    const prices = configuredPrices(env);
    return prices.length === 2 && prices.every((price) => price.tier === 'pro');
  });
  check('Configuration de portail Pro présente', () =>
    /^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PRO_PORTAL_CONFIGURATION_ID ?? ''),
  );
  if (env.STRIPE_BILLING_MODE === 'live') {
    check(
      'Coordonnées vendeur et trois URL de documents valides',
      () => getLaunchInformation(env).ready,
    );
    for (const flag of launchFlags)
      check(`Attestation opérateur : ${flag}`, () => env[flag] === 'true');
  }
  return checks;
}

/** Read-only provider inspection. No resource creation, payment, email or migration. */
export async function onlineChecks(env) {
  const checks = [];
  const check = async (name, operation) => {
    try {
      checks.push({ name, ok: Boolean(await operation()) });
    } catch {
      // Provider errors can contain credentials or personal data. Never print them.
      checks.push({ name, ok: false });
    }
  };
  let stripe;
  let mode;
  try {
    assertStripeSecret(env.STRIPE_SECRET_KEY ?? '', env);
    mode = billingMode(env);
    stripe = new Stripe(env.STRIPE_SECRET_KEY, { timeout: 15_000, maxNetworkRetries: 1 });
  } catch {
    return [{ name: 'Contrôles distants : configuration Stripe valide requise', ok: false }];
  }
  const live = mode === 'live';
  await check('Compte Stripe attendu et encaissement actif si live', async () => {
    const account = await stripe.accounts.retrieve(null);
    const expected = stripeAccountId(env);
    return (
      (!expected || account.id === expected) &&
      (!live || (account.charges_enabled && account.payouts_enabled))
    );
  });
  for (const [interval, amount] of [
    ['month', 399],
    ['year', 2999],
  ]) {
    await check(`Tarif Pro ${interval} : EUR ${amount} centimes, actif et bon mode`, async () => {
      const id = env[`STRIPE_PRO_${interval.toUpperCase()}_PRICE_ID`];
      if (!id) return false;
      const price = await stripe.prices.retrieve(id);
      return (
        price.livemode === live &&
        price.active &&
        price.type === 'recurring' &&
        price.currency === 'eur' &&
        price.unit_amount === amount &&
        price.billing_scheme === 'per_unit' &&
        !price.transform_quantity &&
        price.recurring?.interval === interval &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === 'licensed'
      );
    });
  }
  await check(
    'Portail Pro : factures, moyens de paiement et résiliation en fin de période',
    async () => {
      const id = env.STRIPE_PRO_PORTAL_CONFIGURATION_ID;
      if (!id) return false;
      const portal = await stripe.billingPortal.configurations.retrieve(id);
      const features = portal.features;
      const updates = features.subscription_update;
      const allowed = new Set([env.STRIPE_PRO_MONTH_PRICE_ID, env.STRIPE_PRO_YEAR_PRICE_ID]);
      return (
        portal.active &&
        portal.livemode === live &&
        features.invoice_history.enabled &&
        features.payment_method_update.enabled &&
        features.subscription_cancel.enabled &&
        features.subscription_cancel.mode === 'at_period_end' &&
        (!updates.enabled ||
          (updates.default_allowed_updates.length === 1 &&
            updates.default_allowed_updates[0] === 'price' &&
            updates.products?.length > 0 &&
            updates.products.every(
              (product) =>
                product.prices.length > 0 && product.prices.every((price) => allowed.has(price)),
            )))
      );
    },
  );
  await check(
    'Webhook de cette installation actif et abonnements aux événements complets',
    async () => {
      const url = `${approvedAppOrigin(env)}/api/billing/webhook`;
      const required = [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.subscription.paused',
        'customer.subscription.resumed',
        'invoice.paid',
        'invoice.payment_failed',
        'invoice.payment_action_required',
        'invoice.voided',
        'invoice.marked_uncollectible',
      ];
      for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
        if (
          endpoint.url === url &&
          endpoint.status === 'enabled' &&
          endpoint.livemode === live &&
          required.every(
            (type) =>
              endpoint.enabled_events.includes(type) || endpoint.enabled_events.includes('*'),
          )
        )
          return true;
      }
      return false;
    },
  );
  await check('Migration 0011 et liaison Supabase mode/compte conformes', async () => {
    if (
      !env.NEXT_PUBLIC_SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      invalidSupabaseVariables(env).length
    )
      return false;
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }),
      },
    });
    const { error } = await db.rpc('assert_billing_environment', {
      p_mode: mode,
      p_stripe_account_id: stripeAccountId(env),
    });
    return !error;
  });
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((argument) => !['--online', '--help'].includes(argument))) throw new Error();
    if (args.includes('--help')) {
      console.log(
        'npm run launch:check [-- --online] : contrôle local, ou lectures Stripe/Supabase explicites. Aucune activation.',
      );
    } else {
      const { default: nextEnv } = await import('@next/env');
      let loadFailed = false;
      const { combinedEnv } = nextEnv.loadEnvConfig(process.cwd(), false, {
        info() {},
        error() {
          loadFailed = true;
        },
      });
      if (loadFailed) throw new Error();
      const checks = launchChecks(combinedEnv);
      if (args.includes('--online')) checks.push(...(await onlineChecks(combinedEnv)));
      for (const check of checks) console.log(`${check.ok ? 'OK' : 'À FAIRE'} — ${check.name}`);
      console.log(
        'Ce contrôle ne prouve ni livraison des e-mails/webhooks, ni achat/résiliation, ni conformité juridique. Voir docs/launch-runbook.md.',
      );
      if (
        combinedEnv.STRIPE_BILLING_MODE === 'live' &&
        combinedEnv.STRIPE_LIVE_CHECKOUT_ENABLED !== 'true'
      )
        console.log(
          'Verrou live fermé : le code 1 est normal avant ouverture. Ne pas ouvrir les ventes pour obtenir un contrôle vert.',
        );
      if (checks.some((check) => !check.ok)) process.exitCode = 1;
    }
  } catch {
    console.error(
      'Contrôle impossible. Vérifier les options et la configuration privée, sans publier les clés.',
    );
    process.exitCode = 1;
  }
}
