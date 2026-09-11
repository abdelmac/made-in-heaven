import { NextResponse } from 'next/server';
import { analyticsFiltersSchema, calculateAdvancedAnalytics } from '@/lib/advanced-analytics';
import { assertWorkspaceFeature } from '@/lib/billing/server';
import { durableRateLimit, requireWorkspace } from '@/lib/server/auth';
import { databaseError, handleApiError, HttpError } from '@/lib/server/http';
import { readPermittedProductivity } from '@/lib/server/productivity';
import { getAdminSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const filters = analyticsFiltersSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { supabase, user, workspace } = await requireWorkspace(filters.workspaceId);
    const entitlements = await assertWorkspaceFeature(filters.workspaceId, 'advancedAnalytics');
    await durableRateLimit(user.id, 'advanced-analytics', 60, 60);
    const data = await readPermittedProductivity(supabase, workspace.id, user.id);
    if (
      filters.subjectId &&
      !data.subjects.some((subject) => subject.id === filters.subjectId) &&
      !data.focusSessions.some((session) => session.context.subjectId === filters.subjectId)
    )
      throw new HttpError(400, 'Choose a subject recorded in this workspace.');
    if (
      filters.projectId &&
      !data.projects.some((project) => project.id === filters.projectId) &&
      !data.focusSessions.some((session) => session.context.projectId === filters.projectId)
    )
      throw new HttpError(400, 'Choose a project recorded in this workspace.');
    const teamAnalytics = workspace.kind === 'organization' && entitlements.features.teamWorkspaces;
    const { data: memberships, error } = await supabase
      .from('workspace_memberships')
      .select('user_id')
      .eq('workspace_id', workspace.id);
    if (error) throw databaseError(error);
    const currentMemberIds = memberships.map((member) => member.user_id as string);
    const recordedMemberIds = new Set([
      ...currentMemberIds,
      ...data.focusSessions.map((session) => session.userId),
      ...data.plannedSessions.map((plan) => plan.userId),
    ]);
    if (
      filters.memberId &&
      ((!teamAnalytics && filters.memberId !== user.id) || !recordedMemberIds.has(filters.memberId))
    )
      throw new HttpError(400, 'Choose an authorized member of this workspace.');
    const { data: profiles, error: profileError } = await getAdminSupabase()!
      .from('profiles')
      .select('id,display_name')
      .in('id', currentMemberIds);
    if (profileError) throw databaseError(profileError);
    let metrics;
    try {
      metrics = calculateAdvancedAnalytics(
        data,
        teamAnalytics ? filters : { ...filters, memberId: user.id },
      );
    } catch (cause) {
      throw new HttpError(
        400,
        cause instanceof Error ? cause.message : 'Choose a valid date range.',
      );
    }
    return NextResponse.json(
      {
        ...metrics,
        features: { teamAnalytics },
        members: (teamAnalytics ? [...recordedMemberIds] : [user.id]).map((memberId) => ({
          id: memberId,
          name:
            memberId === user.id
              ? 'You'
              : profiles.find((profile) => profile.id === memberId)?.display_name ||
                (currentMemberIds.includes(memberId) ? 'Workspace member' : 'Former member'),
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
