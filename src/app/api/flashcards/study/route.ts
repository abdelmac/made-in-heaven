import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertWorkspaceFeature } from '@/lib/billing/server';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { databaseError, handleApiError, HttpError } from '@/lib/server/http';
import { flashcardSchema, flashcardDeckSchema } from '@/lib/model';

const querySchema = z
  .object({ workspaceId: z.string().uuid(), deckId: z.string().uuid() })
  .strict();
const studyDocumentSchema = z.object({
  workspaceId: z.string().uuid(),
  flashcardDecks: z.array(flashcardDeckSchema).default([]),
  flashcards: z.array(flashcardSchema).default([]),
});
export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { supabase, user } = await requireWorkspace(query.workspaceId);
    await assertWorkspaceFeature(query.workspaceId, 'flashcards');
    await durableRateLimit(user.id, 'flashcard-study', 60, 60);
    // Read one committed snapshot through the caller's RLS client. This avoids
    // PostgREST row limits truncating large decks or paging across two revisions.
    const { data, error } = await supabase
      .from('workspace_documents')
      .select('data')
      .eq('workspace_id', query.workspaceId)
      .single();
    if (error) throw databaseError(error);
    const parsed = studyDocumentSchema.safeParse(data.data || { workspaceId: query.workspaceId });
    if (!parsed.success || parsed.data.workspaceId !== query.workspaceId)
      throw new HttpError(503, 'Saved flashcards could not be validated.');
    const deck = parsed.data.flashcardDecks.find(
      (item) => item.id === query.deckId && item.workspaceId === query.workspaceId,
    );
    if (!deck) throw new HttpError(404, 'This flashcard deck is not available in this workspace.');
    const cards = parsed.data.flashcards.filter(
      (item) =>
        item.deckId === deck.id &&
        item.workspaceId === query.workspaceId &&
        item.userId === deck.userId,
    );
    return NextResponse.json({ cards }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
