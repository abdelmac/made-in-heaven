import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmptyData, DEFAULT_PREFERENCES, emptyTimer, workspaceDataSchema } from '@/lib/model';
import { databaseError, HttpError } from './http';

export async function readPermittedProductivity(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const [document, preferences] = await Promise.all([
    supabase.from('workspace_documents').select('data').eq('workspace_id', workspaceId).single(),
    supabase
      .from('preferences')
      .select('data')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (document.error) throw databaseError(document.error);
  if (preferences.error) throw databaseError(preferences.error);
  const prefs = preferences.data?.data || DEFAULT_PREFERENCES;
  const parsed = workspaceDataSchema.safeParse({
    ...createEmptyData(workspaceId),
    ...document.data.data,
    preferences: prefs,
    timer: emptyTimer(prefs),
  });
  if (!parsed.success || parsed.data.workspaceId !== workspaceId)
    throw new HttpError(503, 'Saved workspace data could not be validated for analytics.');
  return parsed.data;
}
