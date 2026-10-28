import { expect, test, type Page } from '@playwright/test';
import { createEmptyData } from '../../src/lib/model';
import { DEFAULT_BILLING_POLICY, PLAN_FEATURES } from '../../src/lib/billing/config';
import { en } from '../../src/lib/i18n/en';
export { installNativeBridge, emitNativeAppUrl } from './fixtures/native-bridge';
export type FixtureRequest = {
  url: string;
  path: string;
  method: string;
  body: Record<string, unknown> | null;
  authorization?: string;
  cookie?: string;
};

export async function installNativeAuthRoutes(page: Page, options: { samePassword?: string } = {}) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'mobile@example.test' };
  const workspaceId = '22222222-2222-4222-8222-222222222222';
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .concat('fixture-signature')
    .join('.');
  const session = {
    access_token: token,
    refresh_token: 'fixture-mobile-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  };
  const requests: FixtureRequest[] = [];
  const authRequests: FixtureRequest[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      'authorization,content-type,x-client-info,apikey,x-supabase-api-version,x-folia-document-version,x-folia-mood-version',
  };
  // All HTTPS requests are fulfilled or aborted locally. Signup, reset, and
  // token exchange never reach a provider or send a real email.
  await page.route('https://**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const recorded: FixtureRequest = {
      url: url.href,
      path: url.pathname,
      method: request.method(),
      body: request.postData() ? request.postDataJSON() : null,
      authorization: request.headers().authorization,
      cookie: request.headers().cookie,
    };
    if (url.pathname.startsWith('/auth/v1/')) {
      authRequests.push(recorded);
      if (url.pathname === '/auth/v1/token' && recorded.body?.auth_code === 'expired-code') {
        await route.fulfill({
          status: 400,
          headers: cors,
          json: {
            error_code: 'flow_state_expired',
            msg: 'private-provider-diagnostic fixture-mobile-refresh',
          },
        });
      } else if (url.pathname === '/auth/v1/token' || url.pathname === '/auth/v1/verify') {
        await route.fulfill({ headers: cors, json: session });
      } else if (url.pathname === '/auth/v1/signup') {
        await route.fulfill({ headers: cors, json: { user } });
      } else if (url.pathname === '/auth/v1/recover') {
        await route.fulfill({ headers: cors, json: {} });
      } else if (
        url.pathname === '/auth/v1/user' &&
        recorded.method === 'PUT' &&
        options.samePassword !== undefined &&
        recorded.body?.password === options.samePassword
      ) {
        // Supabase Auth user.go emits NewUnprocessableEntityError for
        // ErrorCodeSamePassword; apierrors.go maps that helper to HTTP 422.
        // https://github.com/supabase/auth/blob/master/internal/api/user.go
        await route.fulfill({
          status: 422,
          headers: cors,
          json: {
            code: 422,
            error_code: 'same_password',
            msg: 'New password should be different from the old password.',
          },
        });
      } else if (url.pathname === '/auth/v1/user') {
        await route.fulfill({ headers: cors, json: user });
      } else {
        await route.fulfill({
          status: 404,
          headers: cors,
          json: { error: 'Unexpected auth route' },
        });
      }
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push(recorded);
      if (url.pathname === '/api/account/consent' && request.method() === 'GET') {
        await route.fulfill({
          headers: cors,
          json: {
            eligible: false,
            acceptance: null,
            versions: { terms: '2026-10-28', privacy: '2026-10-28' },
          },
        });
      } else if (url.pathname === '/api/workspaces') {
        await route.fulfill({
          headers: cors,
          json: {
            user,
            workspaces: [
              {
                id: workspaceId,
                name: 'Espace mobile de test',
                kind: 'personal',
                role: 'owner',
                plan: 'free',
                entitlements: {
                  tier: 'free',
                  features: PLAN_FEATURES.free,
                  limits: DEFAULT_BILLING_POLICY.plans.free,
                },
              },
            ],
          },
        });
      } else if (url.pathname === '/api/sync') {
        await route.fulfill({
          headers: cors,
          json: { data: createEmptyData(workspaceId), version: 0 },
        });
      } else if (url.pathname === '/api/audio') {
        await route.fulfill({ headers: cors, json: { tracks: [] } });
      } else {
        await route.fulfill({
          status: 404,
          headers: cors,
          json: { error: 'Unexpected fixture route' },
        });
      }
      return;
    }
    await route.abort();
  });
  return { user, token, requests, authRequests };
}

export async function openNativeAccount(page: Page) {
  await expect(page.locator('.app-shell')).toBeVisible();
  await page
    .locator('.mobile-header')
    .getByRole('button', { name: 'Ouvrir le compte', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Votre compte Solace', exact: true });
  await expect(dialog).toBeVisible();
  test.skip(
    (await dialog.getByText(en.account.unavailable, { exact: true }).count()) > 0,
    'The mobile bundle needs public Supabase configuration for the mocked native auth flows.',
  );
  return dialog;
}
