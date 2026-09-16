import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabase } from '@/lib/supabase/server';
import { durableRateLimit, requireUser, requireWorkspace } from '@/lib/server/auth';
import {
  assertSameOrigin,
  databaseError,
  handleApiError,
  HttpError,
  readJson,
} from '@/lib/server/http';
import { getWorkspaceEntitlements } from '@/lib/billing/server';
import { invitationEmailConfigured, sendInvitationEmail } from '@/lib/server/invitation-mail';
import {
  organizationDefaults,
  organizationDefaultsSchema,
  workspaceIconSchema,
} from '@/lib/workspace-settings';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(100);
const memberRole = z.enum(['admin', 'member', 'viewer']);
const operationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name }).strict(),
  z.object({ action: z.literal('rename'), workspaceId: uuid, name }).strict(),
  z
    .object({
      action: z.literal('settings'),
      workspaceId: uuid,
      icon: workspaceIconSchema,
      defaultPreferences: organizationDefaultsSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('invite'),
      workspaceId: uuid,
      email: z.string().email().max(254),
      role: memberRole,
      sendEmail: z.boolean().optional().default(false),
    })
    .strict(),
  z
    .object({ action: z.literal('acceptInvite'), token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),
  z.object({ action: z.literal('revokeInvite'), workspaceId: uuid, invitationId: uuid }).strict(),
  z
    .object({ action: z.literal('setRole'), workspaceId: uuid, memberId: uuid, role: memberRole })
    .strict(),
  z.object({ action: z.literal('removeMember'), workspaceId: uuid, memberId: uuid }).strict(),
  z
    .object({
      action: z.literal('transferOwnership'),
      workspaceId: uuid,
      memberId: uuid,
      confirmation: z.literal('TRANSFER'),
    })
    .strict(),
]);

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    const db = getAdminSupabase();
    if (!db) throw new HttpError(503, 'Cloud workspaces are not configured.');
    if (workspaceId) {
      const { workspace, role } = await requireWorkspace(uuid.parse(workspaceId));
      const { data: settings, error: settingsError } = await db
        .from('workspaces')
        .select('icon,settings')
        .eq('id', workspaceId)
        .single();
      if (settingsError) throw databaseError(settingsError);
      const { data: members, error } = await db
        .from('workspace_memberships')
        .select('user_id,role')
        .eq('workspace_id', workspaceId);
      if (error) throw databaseError(error);
      const { data: profiles, error: profileError } = await db
        .from('profiles')
        .select('id,display_name')
        .in(
          'id',
          members.map((member) => member.user_id),
        );
      if (profileError) throw databaseError(profileError);
      const invitations = ['owner', 'admin'].includes(role)
        ? await db
            .from('workspace_invitations')
            .select('id,email,role,expires_at,revoked_at,accepted_at')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (invitations.error) throw databaseError(invitations.error);
      return NextResponse.json(
        {
          workspace,
          icon: settings.icon,
          defaults: organizationDefaults(settings.settings),
          role,
          members: members.map((member) => ({
            ...member,
            display_name:
              profiles.find((profile) => profile.id === member.user_id)?.display_name ||
              'Workspace member',
          })),
          invitations: invitations.data,
          invitationEmailAvailable:
            ['owner', 'admin'].includes(role) && invitationEmailConfigured(),
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    const { supabase, user } = await requireUser();
    const { error: onboardError } = await db.rpc('folia_onboard', { p_user: user.id });
    if (onboardError) throw databaseError(onboardError);
    const { data: memberships, error } = await supabase
      .from('workspace_memberships')
      .select('workspace_id,role')
      .eq('user_id', user.id);
    if (error) throw databaseError(error);
    const { data: workspaces, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id,name,kind,icon')
      .in(
        'id',
        memberships.map((membership) => membership.workspace_id),
      )
      .order('created_at');
    if (workspaceError) throw databaseError(workspaceError);
    const result = await Promise.all(
      workspaces.map(async (workspace) => {
        const entitlements = await getWorkspaceEntitlements(workspace.id);
        return {
          ...workspace,
          role: memberships.find((membership) => membership.workspace_id === workspace.id)!.role,
          plan: entitlements.tier,
          entitlements,
        };
      }),
    );
    return NextResponse.json(
      { workspaces: result, user: { id: user.id, email: user.email } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    await durableRateLimit(user.id, 'workspace-management', 20, 60);
    const body = operationSchema.parse(await readJson(request, 10000));
    const db = getAdminSupabase()!;
    if (body.action === 'settings') {
      const { data, error } = await db.rpc('folia_set_organization_settings', {
        p_actor: user.id,
        p_workspace: body.workspaceId,
        p_icon: body.icon,
        p_defaults: body.defaultPreferences,
      });
      if (error) throw databaseError(error);
      return NextResponse.json(data);
    }
    const input: Record<string, unknown> = { ...body };
    let token: string | undefined;
    let invitationWorkspaceName = '';
    if (body.action === 'invite') {
      const { workspace, role } = await requireWorkspace(body.workspaceId, {
        roles: ['owner', 'admin'],
      });
      const entitlements = await getWorkspaceEntitlements(body.workspaceId);
      if (workspace.kind !== 'organization' || !entitlements.features.teamWorkspaces)
        throw new HttpError(
          403,
          'Les invitations nécessitent une organisation avec un forfait Team actif.',
        );
      if (role !== 'owner' && body.role === 'admin')
        throw new HttpError(403, 'Seul le propriétaire peut inviter un administrateur.');
      if (body.sendEmail) await durableRateLimit(user.id, 'workspace-invitation-email', 5, 60);
      invitationWorkspaceName = workspace.name;
      delete input.sendEmail;
      token = randomBytes(32).toString('hex');
      input.tokenHash = createHash('sha256').update(token).digest('hex');
    }
    if (body.action === 'acceptInvite') {
      input.tokenHash = createHash('sha256').update(body.token).digest('hex');
      delete input.token;
    }
    const { data, error } = await db.rpc('folia_manage_workspace', {
      p_actor: user.id,
      p_action: body.action,
      p_workspace: 'workspaceId' in body ? body.workspaceId : null,
      p_input: input,
    });
    if (error) throw databaseError(error);
    if (token && body.action === 'invite') {
      const inviteUrl = new URL('/', process.env.NEXT_PUBLIC_APP_URL || request.url);
      inviteUrl.searchParams.set('invite', token);
      const emailStatus = body.sendEmail
        ? await sendInvitationEmail({
            invitationId: data.invitation.id,
            email: data.invitation.email,
            workspaceName: invitationWorkspaceName,
            inviteUrl: inviteUrl.toString(),
          })
        : 'not_requested';
      return NextResponse.json(
        { ...data, inviteUrl: inviteUrl.toString(), emailStatus },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
