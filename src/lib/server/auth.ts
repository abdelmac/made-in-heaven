import 'server-only';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase/server';
import { HttpError, databaseError } from './http';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export async function requireUser() {
  const supabase = await getServerSupabase();
  if (!supabase)
    throw new HttpError(
      503,
      'Cloud accounts are not configured. You can keep using Folia locally.',
    );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Sign in to continue.');
  return { supabase, user };
}

export async function requireWorkspace(workspaceId: string, options: { roles?: Role[] } = {}) {
  const { supabase, user } = await requireUser();
  const { data: membership, error } = await supabase
    .from('workspace_memberships')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!membership) throw new HttpError(403, 'You do not have access to this workspace.');
  const role = membership.role as Role;
  if (options.roles && !options.roles.includes(role))
    throw new HttpError(403, 'Your workspace role does not allow this action.');
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id,name,kind')
    .eq('id', workspaceId)
    .single();
  if (workspaceError || !workspace) throw new HttpError(403, 'This workspace is not available.');
  return {
    supabase,
    user,
    workspace: workspace as { id: string; name: string; kind: 'personal' | 'organization' },
    role,
  };
}

export async function durableRateLimit(
  userId: string,
  scope: string,
  limit = 30,
  windowSeconds = 60,
) {
  const admin = getAdminSupabase();
  if (!admin) throw new HttpError(503, 'Server credentials are not configured.');
  const { data, error } = await admin.rpc('folia_rate_limit', {
    p_user: userId,
    p_scope: scope,
    p_limit: limit,
    p_seconds: windowSeconds,
  });
  if (error) throw databaseError(error);
  if (!data) throw new HttpError(429, 'Too many requests. Please try again shortly.');
}
