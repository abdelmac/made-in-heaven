import { describe, expect, it, vi } from 'vitest';
import { createDemoData, createEmptyData, id } from '@/lib/model';
import {
  applyDocumentPatch,
  fetchWorkspaceSnapshot,
  makeDocumentPatch,
  snapshotPage,
} from '@/lib/sync-transfer';

describe('incremental document transfer', () => {
  it('preserves exact collection ordering across edits, deletion, insertion and reordering', () => {
    const previous = createDemoData(),
      next = structuredClone(previous);
    next.tasks[0].title = 'Version corrigée';
    next.tasks.push({ ...next.tasks[0], id: id(), checklist: [] });
    next.tasks.reverse();
    next.plannedSessions.splice(1, 1);
    next.preferences.sound = true;
    expect(applyDocumentPatch(previous, makeDocumentPatch(previous, next))).toEqual(next);
    expect(previous.tasks[0].title).not.toBe('Version corrigée');
  });
  it('does not retransmit unchanged large histories', () => {
    const previous = createDemoData(),
      next = structuredClone(previous);
    previous.noteSheets = Array.from({ length: 80 }, () => ({
      id: id(),
      workspaceId: previous.workspaceId,
      userId: '00000000-0000-4000-8000-000000000002',
      createdAt: previous.updatedAt,
      updatedAt: previous.updatedAt,
      title: 'Note',
      content: 'a'.repeat(15000),
      kind: 'note' as const,
      revisions: [],
    }));
    next.noteSheets = structuredClone(previous.noteSheets);
    next.tasks[0].title = 'Une seule modification';
    const patch = makeDocumentPatch(previous, next);
    expect(JSON.stringify(patch).length).toBeLessThan(10000);
    expect(patch.collections.noteSheets).toBeUndefined();
    expect(applyDocumentPatch(previous, patch)).toEqual(next);
  });
  it('rejects foreign workspaces, invalid collections and broken links without changing the source', () => {
    const data = createDemoData(),
      patch = makeDocumentPatch(data, data);
    patch.metadata.workspaceId = id();
    expect(() => applyDocumentPatch(data, patch)).toThrow();
    const invalid = makeDocumentPatch(data, data);
    invalid.collections.subjects = { remove: [data.subjects[0].id], replace: [], insert: [] };
    expect(() => applyDocumentPatch(data, invalid)).toThrow();
    expect(data.subjects).toHaveLength(3);
    expect(() =>
      applyDocumentPatch(data, { ...invalid, collections: { memberships: {} } }),
    ).toThrow();
  });
});

describe('paged consistent snapshots', () => {
  it('reassembles pages only after receiving the whole version', async () => {
    const data = createDemoData();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const params = new URL(String(input), 'http://localhost').searchParams;
      return Response.json({
        ...snapshotPage(data, Number(params.get('cursor')), 600),
        version: 8,
      });
    });
    const snapshot = await fetchWorkspaceSnapshot(data.workspaceId, fetcher);
    expect(snapshot.data).toEqual(data);
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
    expect(snapshot.version).toBe(8);
  });
  it('discards partial data on concurrent changes and starts from the next complete version', async () => {
    const data = createDemoData();
    let conflicted = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const cursor = Number(new URL(String(input), 'http://localhost').searchParams.get('cursor'));
      if (cursor > 0 && !conflicted) {
        conflicted = true;
        return Response.json({}, { status: 409 });
      }
      return Response.json({ ...snapshotPage(data, cursor, 600), version: conflicted ? 9 : 8 });
    });
    expect((await fetchWorkspaceSnapshot(data.workspaceId, fetcher)).version).toBe(9);
  });
  it('handles an empty workspace and rejects truncated page sequences', async () => {
    const data = createEmptyData();
    expect(snapshotPage(data).nextCursor).toBeNull();
    const fetcher = vi.fn(async () =>
      Response.json({ ...snapshotPage(data), total: 1, version: 1 }),
    );
    await expect(fetchWorkspaceSnapshot(data.workspaceId, fetcher)).rejects.toThrow('incomplet');
    expect(() => snapshotPage(data, 100)).toThrow();
  });
  it('requests mood capability when loading a workspace snapshot', async () => {
    const data = createEmptyData();
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ...snapshotPage(data), version: 1 }),
    );
    await fetchWorkspaceSnapshot(data.workspaceId, fetcher);
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get('X-Folia-Document-Version')).toBe('2');
    expect(headers.get('X-Folia-Mood-Version')).toBe('1');
  });
});
