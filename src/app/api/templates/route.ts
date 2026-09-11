import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertWorkspaceFeature } from '@/lib/billing/server';
import { handleApiError } from '@/lib/server/http';
import { SOFTWARE_DEVELOPMENT_TEMPLATE } from '@/lib/server/advanced-template';

const querySchema = z
  .object({ workspaceId: z.string().uuid(), template: z.literal('software-development') })
  .strict();
export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { user } = await requireWorkspace(query.workspaceId, {
      roles: ['owner', 'admin', 'member'],
    });
    await assertWorkspaceFeature(query.workspaceId, 'advancedTemplates');
    await durableRateLimit(user.id, 'advanced-templates', 60, 60);
    return NextResponse.json(
      { template: SOFTWARE_DEVELOPMENT_TEMPLATE },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
