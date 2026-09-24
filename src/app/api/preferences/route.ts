import { NextResponse } from 'next/server';
import { z } from 'zod';
import { preferencesSchema } from '@/lib/model';
import { getAdminSupabase } from '@/lib/supabase/server';
import { durableRateLimit, requireWorkspace } from '@/lib/server/auth';
import { assertSameOrigin, databaseError, handleApiError, readJson } from '@/lib/server/http';
import {
  preferenceRpcPayload,
  serializePreferences,
  supportsLearningDocument,
  supportsMoodPreferences,
} from '@/lib/server/legacy-fields';

const uuid = z.string().uuid();
const inputSchema = z
  .object({
    preferences: preferencesSchema,
    expectedVersion: z.number().int().min(0),
    operationId: uuid,
  })
  .strict();

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const workspaceId = uuid.parse(new URL(request.url).searchParams.get('workspaceId'));
    const { user } = await requireWorkspace(workspaceId);
    await durableRateLimit(user.id, 'preferences', 90, 60);
    const submitted = await readJson(request);
    const body = inputSchema.parse(submitted);
    const { data, error } = await getAdminSupabase()!.rpc('folia_save_preferences', {
      p_actor: user.id,
      p_workspace: workspaceId,
      p_preferences: preferenceRpcPayload(
        body.preferences,
        (submitted as { preferences: unknown }).preferences,
      ),
      p_expected_version: body.expectedVersion,
      p_operation: body.operationId,
    });
    if (error) throw databaseError(error);
    if (data.conflict)
      return NextResponse.json(
        {
          error:
            'Another device saved changes. Review the cloud version before saving preferences.',
          version: data.version,
        },
        { status: 409 },
      );
    return NextResponse.json({
      ...data,
      preferences: serializePreferences(
        preferencesSchema.parse(data.preferences || body.preferences),
        supportsLearningDocument(request),
        supportsMoodPreferences(request),
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
