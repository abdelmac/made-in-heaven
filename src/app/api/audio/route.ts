import { NextResponse } from 'next/server';
import { z } from 'zod';
import { durableRateLimit, requireWorkspace } from '@/lib/server/auth';
import { getWorkspaceEntitlements } from '@/lib/billing/server';
import { getAdminSupabase } from '@/lib/supabase/server';
import { databaseError, handleApiError, HttpError } from '@/lib/server/http';

const querySchema = z
  .object({
    workspaceId: z.string().uuid(),
    trackId: z.string().uuid().optional(),
  })
  .strict();
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { user } = await requireWorkspace(query.workspaceId);
    await durableRateLimit(user.id, 'audio-playback', 60, 60);
    const entitlements = await getWorkspaceEntitlements(query.workspaceId);
    if (!entitlements.features.music)
      throw new HttpError(403, 'Les ambiances audio nécessitent un forfait Pro ou Team actif.');
    const db = getAdminSupabase();
    if (!db) throw new HttpError(503, 'Le catalogue audio est indisponible.');
    if (!query.trackId) {
      const { data, error } = await db
        .from('audio_tracks')
        .select('id,title,attribution,duration_seconds,category')
        .eq('active', true)
        .order('title')
        .limit(100);
      if (error) throw databaseError(error);
      return NextResponse.json({ tracks: data }, { headers: noStore });
    }
    const { data: track, error } = await db
      .from('audio_tracks')
      .select('id,storage_path')
      .eq('id', query.trackId)
      .eq('active', true)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!track) throw new HttpError(404, 'Cette piste n’est plus disponible.');
    const { data: signed, error: signingError } = await db.storage
      .from('pro-audio')
      .createSignedUrl(track.storage_path, 120);
    if (signingError || !signed)
      throw new HttpError(503, 'Impossible de préparer cette piste. Réessayez.');
    return NextResponse.json({ url: signed.signedUrl, expiresIn: 120 }, { headers: noStore });
  } catch (error) {
    const response = handleApiError(error);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
