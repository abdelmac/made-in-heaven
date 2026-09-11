import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase/server';
import { HttpError } from '@/lib/server/http';
import type { Entitlements } from './entitlements';
import type { Feature } from './config';

export function billingDatabase() {
  const db = getAdminSupabase();
  if (!db) throw new HttpError(503, 'Cloud billing is not configured.');
  return db;
}

export async function getWorkspaceEntitlements(workspaceId: string): Promise<Entitlements> {
  const { data, error } = await billingDatabase().rpc('workspace_entitlements', {
    p_workspace_id: workspaceId,
  });
  if (error || !data)
    throw new HttpError(503, 'Workspace entitlements could not be verified. Please reconnect.');
  return data as Entitlements;
}

export async function assertWorkspaceFeature(
  workspaceId: string,
  feature: Feature,
): Promise<Entitlements> {
  const entitlements = await getWorkspaceEntitlements(workspaceId);
  if (!entitlements.features[feature])
    throw new HttpError(
      403,
      'This operation requires an active paid plan for this workspace. Existing data remains available.',
    );
  return entitlements;
}

export async function withBillingLock<T>(
  workspaceId: string,
  operation: (token: string) => Promise<T>,
): Promise<T> {
  const db = billingDatabase();
  const token = randomUUID();
  const { data, error } = await db.rpc('claim_billing_workspace', {
    p_workspace_id: workspaceId,
    p_token: token,
  });
  if (error) throw new HttpError(503, 'Billing could not acquire its processing lock.');
  if (!data)
    throw new HttpError(409, 'Another billing change is processing. Please try again shortly.');
  try {
    return await operation(token);
  } finally {
    await db.rpc('release_billing_workspace', { p_workspace_id: workspaceId, p_token: token });
  }
}

export async function persistSubscription(
  workspaceId: string,
  token: string,
  patch: Record<string, unknown>,
  eventId: string | null = null,
) {
  const { error } = await billingDatabase().rpc('commit_billing_state', {
    p_workspace_id: workspaceId,
    p_token: token,
    p_patch: patch,
    p_event_id: eventId,
  });
  if (error)
    throw new HttpError(503, 'Billing state could not be saved. The change will be retried.');
}
