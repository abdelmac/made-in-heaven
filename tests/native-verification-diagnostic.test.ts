import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { HttpError, handleApiError } from '@/lib/server/http';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  rate: vi.fn(),
  config: vi.fn(),
  legal: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.owner,
  durableRateLimit: mocks.rate,
}));
vi.mock('@/lib/billing/native-config', () => ({ nativePublicConfiguration: mocks.config }));
vi.mock('@/lib/billing/native-server', () => ({
  nativeLegalEligible: mocks.legal,
  verifyNativePurchase: mocks.verify,
}));

import { nativeVerificationDiagnostic } from '@/lib/billing/native-verification-diagnostic';
import { POST } from '@/app/api/billing/native/verify/route';

const cases = [
  ['This Google Play purchase belongs to another environment.', 'environment_mismatch'],
  ['Google Play returned an invalid subscription.', 'invalid_subscription'],
  ['This Google Play product or base plan is not configured.', 'product_mismatch'],
  ['Google Play subscription state is unsupported.', 'unsupported_state'],
  ['Google Play subscription expiry is invalid.', 'invalid_expiry'],
] as const;
const secret = 'private-receipt-token.fixture-secret';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const request = (extra = {}) =>
  new Request('https://solace.example/api/billing/native/verify', {
    method: 'POST',
    headers: {
      origin: 'capacitor://localhost',
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId,
      platform: 'android',
      productId: 'pro.monthly',
      purchaseToken: secret,
      ...extra,
    }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.owner.mockResolvedValue({ user: { id: secret }, workspace: { kind: 'personal' } });
  mocks.legal.mockResolvedValue(true);
  mocks.config.mockReturnValue({ ready: true, productId: 'pro.monthly' });
  mocks.verify.mockResolvedValue({ verified: true, acknowledged: true });
});

afterEach(() => vi.restoreAllMocks());

describe('native verification diagnostic privacy', () => {
  it.each(cases)('classifies only the exact fixed 400 message: %s', (message, code) => {
    expect(nativeVerificationDiagnostic(new HttpError(400, message), 400)).toEqual({
      event: 'native_purchase_verification_failed',
      code,
      status: 400,
    });
    expect(nativeVerificationDiagnostic(new HttpError(503, message), 503).code).toBe(
      'verification_failed',
    );
    expect(nativeVerificationDiagnostic(new HttpError(400, `${message} ${secret}`), 400).code).toBe(
      'verification_failed',
    );
  });

  it('categorizes validation errors without including issue messages or paths', () => {
    const error = new ZodError([{ code: 'custom', path: [secret], message: secret }]);
    expect(nativeVerificationDiagnostic(error, 400)).toEqual({
      event: 'native_purchase_verification_failed',
      code: 'invalid_request',
      status: 400,
    });
  });

  it('reduces unknown errors and their secret-like properties to fixed fields', () => {
    const error = Object.assign(new Error(secret), {
      code: secret,
      body: { purchaseToken: secret },
      authorization: secret,
      stack: secret,
    });
    expect(nativeVerificationDiagnostic(error, 500)).toEqual({
      event: 'native_purchase_verification_failed',
      code: 'verification_failed',
      status: 500,
    });
    expect(nativeVerificationDiagnostic(new HttpError(400, secret), 400)).toEqual({
      event: 'native_purchase_verification_failed',
      code: 'verification_failed',
      status: 400,
    });
  });
});

describe('native verification route diagnostics', () => {
  it.each(cases)('logs one safe event and preserves the API error: %s', async (message, code) => {
    const error = new HttpError(400, message);
    mocks.verify.mockRejectedValue(error);
    const response = await POST(request());
    const expected = handleApiError(error);
    expect(response.status).toBe(expected.status);
    expect(await response.json()).toEqual(await expected.json());
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ event: 'native_purchase_verification_failed', code, status: 400 }),
    );
  });

  it('logs no request, receipt, identity or unknown error details', async () => {
    mocks.verify.mockRejectedValue(Object.assign(new Error(secret), { purchaseToken: secret }));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: 'native_purchase_verification_failed',
        code: 'verification_failed',
        status: 500,
      }),
    );
  });

  it('logs validation failures without the submitted value or unknown key', async () => {
    const response = await POST(request({ [secret]: secret }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: 'native_purchase_verification_failed',
        code: 'invalid_request',
        status: 400,
      }),
    );
  });

  it('does not emit a failure event for a successful verification', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true, acknowledged: true });
    expect(console.warn).not.toHaveBeenCalled();
  });
});
