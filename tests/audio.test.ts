import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/lib/server/http';
import { createAmbientPreview } from '../src/lib/ambient-preview';

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  durableRateLimit: vi.fn(),
  getWorkspaceEntitlements: vi.fn(),
  getAdminSupabase: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
  createSignedUrl: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.requireWorkspace,
  durableRateLimit: mocks.durableRateLimit,
}));
vi.mock('@/lib/billing/server', () => ({
  getWorkspaceEntitlements: mocks.getWorkspaceEntitlements,
}));
vi.mock('@/lib/supabase/server', () => ({ getAdminSupabase: mocks.getAdminSupabase }));
import { GET } from '../src/app/api/audio/route';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const trackId = '123e4567-e89b-42d3-a456-426614174001';
const request = (track = true, extra = '') =>
  new Request(
    `https://solace.example/api/audio?workspaceId=${workspaceId}${track ? `&trackId=${trackId}` : ''}${extra}`,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspace.mockResolvedValue({ user: { id: 'member' }, role: 'viewer' });
  mocks.durableRateLimit.mockResolvedValue(undefined);
  mocks.getWorkspaceEntitlements.mockResolvedValue({ features: { music: true } });
  const chain = {
    select: mocks.select,
    eq: mocks.eq,
    order: mocks.order,
    limit: mocks.limit,
    maybeSingle: mocks.maybeSingle,
  };
  for (const method of [mocks.select, mocks.eq, mocks.order]) method.mockReturnValue(chain);
  mocks.limit.mockResolvedValue({ data: [{ id: trackId, title: 'Pluie' }], error: null });
  mocks.maybeSingle.mockResolvedValue({
    data: { id: trackId, storage_path: 'owned/rain.mp3' },
    error: null,
  });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example/signed?token=test' },
    error: null,
  });
  mocks.getAdminSupabase.mockReturnValue({
    from: () => chain,
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  });
});

describe('private audio catalogue authorization', () => {
  it('allows a paid workspace viewer to listen using only a 120-second signed URL', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(workspaceId);
    expect(mocks.durableRateLimit).toHaveBeenCalledWith('member', 'audio-playback', 60, 60);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('owned/rain.mp3', 120);
    expect(await response.json()).toEqual({
      url: 'https://storage.example/signed?token=test',
      expiresIn: 120,
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects nonmembers before reading paid data or issuing signed URLs', async () => {
    mocks.requireWorkspace.mockRejectedValue(new HttpError(403, 'Accès refusé.'));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
  it('rejects Free and downgraded workspaces every time playback is requested', async () => {
    mocks.getWorkspaceEntitlements.mockResolvedValue({ features: { music: false } });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
  it('lists metadata without exposing storage paths or signed URLs', async () => {
    const response = await GET(request(false));
    expect(await response.json()).toEqual({ tracks: [{ id: trackId, title: 'Pluie' }] });
    expect(mocks.select).toHaveBeenCalledWith('id,title,attribution,duration_seconds,category');
    expect(mocks.eq).toHaveBeenCalledWith('active', true);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
  it('rejects inactive or missing catalogue entries and arbitrary supplied media URLs', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await GET(request())).status).toBe(404);
    expect((await GET(request(true, '&url=https://other.example/track.mp3'))).status).toBe(400);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
  it('fails closed on rate limits and signing errors', async () => {
    mocks.durableRateLimit.mockRejectedValueOnce(new HttpError(429, 'Trop de demandes.'));
    expect((await GET(request())).status).toBe(429);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'secret provider detail' },
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('secret provider detail');
  });
});

describe('original ambient preview', () => {
  it('produces bounded, non-silent PCM loops with a valid WAV header', async () => {
    for (const id of ['soft-rain', 'calm-waves']) {
      const blob = createAmbientPreview(id);
      const bytes = await blob.arrayBuffer();
      const view = new DataView(bytes);
      expect(blob.type).toBe('audio/wav');
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
      expect(view.getUint32(4, true) + 8).toBe(bytes.byteLength);
      expect(view.getUint32(24, true)).toBe(16_000);
      expect(view.getUint32(40, true)).toBe(16_000 * 12 * 2);
      let peak = 0;
      for (let offset = 44; offset < bytes.byteLength; offset += 2)
        peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
      expect(peak).toBeGreaterThan(500);
      expect(peak).toBeLessThanOrEqual(32767 * 0.7 + 1);
      expect(view.getInt16(44, true)).toBe(0);
      expect(view.getInt16(bytes.byteLength - 2, true)).toBe(0);
    }
  });
});
