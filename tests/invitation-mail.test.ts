import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/lib/server/http';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireWorkspace: vi.fn(),
  durableRateLimit: vi.fn(),
  getWorkspaceEntitlements: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireUser: mocks.requireUser,
  requireWorkspace: mocks.requireWorkspace,
  durableRateLimit: mocks.durableRateLimit,
}));
vi.mock('@/lib/supabase/server', () => ({ getAdminSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/billing/server', () => ({
  assertBillingEnvironment: vi.fn(async () => undefined),
  getWorkspaceEntitlements: mocks.getWorkspaceEntitlements,
}));

import { invitationEmailConfigured, sendInvitationEmail } from '../src/lib/server/invitation-mail';
import { POST } from '../src/app/api/workspaces/route';

const origin = 'https://solace.example';
const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const emailInput = {
  invitationId: 'invitation-1',
  email: 'colleague@example.com',
  workspaceName: 'Notre équipe <script>',
  inviteUrl: `${origin}/?invite=${'a'.repeat(64)}`,
};
const request = (extra: Record<string, unknown> = {}, requestOrigin = origin) =>
  new Request(`${origin}/api/workspaces`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'invite',
      workspaceId,
      email: emailInput.email,
      role: 'member',
      ...extra,
    }),
  });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin);
  vi.stubEnv('RESEND_API_KEY', 're_test_only');
  vi.stubEnv('INVITATION_EMAIL_FROM', 'invitations@example.com');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: 'provider-message-1' }));
  mocks.requireUser.mockResolvedValue({ user: { id: 'owner' } });
  mocks.requireWorkspace.mockResolvedValue({
    role: 'owner',
    workspace: { id: workspaceId, kind: 'organization', name: emailInput.workspaceName },
  });
  mocks.getWorkspaceEntitlements.mockResolvedValue({ features: { teamWorkspaces: true } });
  mocks.durableRateLimit.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({
    data: { invitation: { id: emailInput.invitationId, email: emailInput.email } },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('optional invitation email adapter', () => {
  it('requires a sender and a canonical HTTPS origin without exposing credentials', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(invitationEmailConfigured()).toBe(false);
    expect(await sendInvitationEmail(emailInput)).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('RESEND_API_KEY', 're_test_only');
    for (const url of [
      'http://localhost:3000',
      'https://solace.example/path',
      'https://user:pass@solace.example',
    ]) {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', url);
      expect(invitationEmailConfigured()).toBe(false);
    }
  });
  it('sends text to only the invited address with a stable idempotency key', async () => {
    expect(await sendInvitationEmail(emailInput)).toBe('accepted');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers['Idempotency-Key']).toBe('solace-invitation/invitation-1');
    const payload = JSON.parse(options.body);
    expect(payload.to).toEqual([emailInput.email]);
    expect(payload.text).toContain(emailInput.inviteUrl);
    expect(payload.html).toBeUndefined();
    expect(payload.from).toBe('Solace <invitations@example.com>');
  });
  it('rejects a foreign invitation origin before calling the provider', async () => {
    expect(await sendInvitationEmail({ ...emailInput, inviteUrl: 'https://other.example/' })).toBe(
      'failed',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('distinguishes a provider refusal from an ambiguous timeout or server error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('private provider error', { status: 403 }));
    expect(await sendInvitationEmail(emailInput)).toBe('failed');
    fetchMock.mockRejectedValueOnce(new Error('private provider error'));
    expect(await sendInvitationEmail(emailInput)).toBe('unknown');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect(await sendInvitationEmail(emailInput)).toBe('unknown');
  });
});

describe('team invitation authorization and creation', () => {
  it('creates a hashed, private link without sending email by default', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emailStatus).toBe('not_requested');
    expect(new URL(data.inviteUrl).searchParams.get('invite')).toMatch(/^[a-f0-9]{64}$/);
    const input = mocks.rpc.mock.calls[0][1].p_input;
    expect(input.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.tokenHash).not.toBe(new URL(data.inviteUrl).searchParams.get('invite'));
    expect(input.sendEmail).toBeUndefined();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends only after successful creation and rate limiting', async () => {
    const response = await POST(request({ sendEmail: true }));
    expect((await response.json()).emailStatus).toBe('accepted');
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(workspaceId, { roles: ['owner', 'admin'] });
    expect(mocks.durableRateLimit).toHaveBeenCalledWith(
      'owner',
      'workspace-invitation-email',
      5,
      60,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps the new link available after an email refusal', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rejected', { status: 403 }));
    const response = await POST(request({ sendEmail: true }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.emailStatus).toBe('failed');
    expect(data.inviteUrl).toContain('?invite=');
  });
  it('never sends for a duplicate or rejected invitation', async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: '23505', message: 'Invitation déjà en attente.' },
    });
    expect((await POST(request({ sendEmail: true }))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests and unavailable Team rights', async () => {
    expect((await POST(request({ sendEmail: true }, 'https://other.example'))).status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    mocks.getWorkspaceEntitlements.mockResolvedValue({ features: { teamWorkspaces: false } });
    expect((await POST(request({ sendEmail: true }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unauthorized roles, admin escalation, and email rate limit violations', async () => {
    mocks.requireWorkspace.mockRejectedValueOnce(new HttpError(403, 'Accès refusé.'));
    expect((await POST(request({ sendEmail: true }))).status).toBe(403);
    mocks.requireWorkspace.mockResolvedValue({
      role: 'admin',
      workspace: { kind: 'organization', name: 'Équipe' },
    });
    expect((await POST(request({ sendEmail: true, role: 'admin' }))).status).toBe(403);
    mocks.durableRateLimit.mockImplementation(async (_user, scope) => {
      if (scope === 'workspace-invitation-email') throw new HttpError(429, 'Trop de demandes.');
    });
    expect((await POST(request({ sendEmail: true }))).status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
