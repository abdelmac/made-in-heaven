import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  workspaceDataSchema,
  emptyTimer,
  DEFAULT_PREFERENCES,
  createEmptyData,
  type WorkspaceData,
} from '@/lib/model';
import { getAdminSupabase } from '@/lib/supabase/server';
import { durableRateLimit, requireWorkspace } from '@/lib/server/auth';
import {
  assertSameOrigin,
  databaseError,
  handleApiError,
  HttpError,
  readJson,
} from '@/lib/server/http';
import { validateDocumentChange } from '@/lib/server/document';
import {
  documentRpcPayload,
  preserveLegacyDocumentFields,
  serializeDocument,
  supportsLearningDocument,
} from '@/lib/server/legacy-fields';

const idSchema = z.string().uuid();
const bodySchema = z
  .object({
    data: z.unknown(),
    expectedVersion: z.number().int().min(0),
    operationId: idSchema,
  })
  .strict();

async function readDocument(workspaceId: string, userId: string) {
  const db = getAdminSupabase();
  if (!db) throw new HttpError(503, 'Cloud storage is not configured.');
  const [document, prefs, timer] = await Promise.all([
    db.from('workspace_documents').select('data,version').eq('workspace_id', workspaceId).single(),
    db
      .from('preferences')
      .select('data,timer_state')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('active_timers')
      .select('payload')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (document.error) throw databaseError(document.error);
  if (prefs.error) throw databaseError(prefs.error);
  if (timer.error) throw databaseError(timer.error);
  const data = (document.data.data || createEmptyData(workspaceId)) as WorkspaceData;
  let preferences = prefs.data?.data;
  if (!preferences) {
    const initialized = await db.rpc('folia_initialize_preferences', {
      p_actor: userId,
      p_workspace: workspaceId,
      p_base: DEFAULT_PREFERENCES,
    });
    if (initialized.error) throw databaseError(initialized.error);
    preferences = initialized.data;
  }
  data.preferences = preferences;
  data.timer = timer.data?.payload || prefs.data?.timer_state || emptyTimer(data.preferences);
  data.revision = document.data.version;
  return { data: workspaceDataSchema.parse(data), version: document.data.version as number };
}

async function clientDocument(request: Request, workspaceId: string, userId: string) {
  const snapshot = await readDocument(workspaceId, userId);
  return { ...snapshot, data: serializeDocument(snapshot.data, supportsLearningDocument(request)) };
}

export async function GET(request: Request) {
  try {
    const workspaceId = idSchema.parse(new URL(request.url).searchParams.get('workspaceId'));
    const { user } = await requireWorkspace(workspaceId);
    return NextResponse.json(await clientDocument(request, workspaceId, user.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const workspaceId = idSchema.parse(new URL(request.url).searchParams.get('workspaceId'));
    const { user } = await requireWorkspace(workspaceId, { roles: ['owner', 'admin', 'member'] });
    await durableRateLimit(user.id, 'sync', 180, 60);
    const submitted = bodySchema.parse(await readJson(request));
    const current = await readDocument(workspaceId, user.id);
    const body = {
      ...submitted,
      data: workspaceDataSchema.parse(
        current.version === submitted.expectedVersion
          ? preserveLegacyDocumentFields(submitted.data, current.data)
          : submitted.data,
      ),
    };
    if (body.data.workspaceId !== workspaceId)
      throw new HttpError(400, 'The document belongs to a different workspace.');
    const db = getAdminSupabase()!;
    const { data: members, error: memberError } = await db
      .from('workspace_memberships')
      .select('user_id')
      .eq('workspace_id', workspaceId);
    if (memberError) throw databaseError(memberError);
    // Validate only the version the caller edited. The transaction below rechecks CAS.
    if (current.version === body.expectedVersion)
      validateDocumentChange(
        current.data,
        body.data,
        user.id,
        new Set(members.map((member) => member.user_id)),
      );
    const { data, error } = await db.rpc('folia_commit_document', {
      p_actor: user.id,
      p_workspace: workspaceId,
      p_data: documentRpcPayload(body.data, submitted.data),
      p_expected_version: body.expectedVersion,
      p_operation: body.operationId,
    });
    if (error) throw databaseError(error);
    if (data?.conflict)
      return NextResponse.json(
        {
          error: 'Another device saved changes. Review the cloud version before continuing.',
          ...(await clientDocument(request, workspaceId, user.id)),
        },
        { status: 409 },
      );
    let committedVersion = data.version as number;
    if (data.replayed) {
      const { data: operation, error: operationError } = await db
        .from('sync_operations')
        .select('version')
        .eq('workspace_id', workspaceId)
        .eq('operation_id', body.operationId)
        .single();
      if (operationError) throw databaseError(operationError);
      committedVersion = operation.version;
    }
    // The fresh document may include a later device's write. Acknowledgments must
    // rebase pending edits only on this operation's own committed version.
    return NextResponse.json({
      ...(await clientDocument(request, workspaceId, user.id)),
      committedVersion,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
