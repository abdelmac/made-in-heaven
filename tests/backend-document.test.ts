import { describe, expect, it } from 'vitest';
import { createEmptyData, id, type WorkspaceData } from '@/lib/model';
import { startTimer, completeTimer } from '@/lib/timer';
import { validateDocumentChange } from '@/lib/server/document';
import { assertSameOrigin, readJson } from '@/lib/server/http';

const actor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const members = new Set([actor, other]);
const stamp = Date.parse('2026-09-01T09:00:00Z');
const completed = () =>
  completeTimer(
    startTimer(createEmptyData(), { durationMinutes: 1 }, actor, stamp),
    stamp + 60_000,
  );

describe('server document invariants', () => {
  it('allows preserved history after a cloud JSON round trip regardless of property order', () => {
    const previous = completed();
    const reordered = JSON.parse(JSON.stringify(previous), (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ) as WorkspaceData;
    expect(() => validateDocumentChange(previous, reordered, actor, members)).not.toThrow();
  });
  it('rejects changing frozen completed context', () => {
    const previous = completed();
    const next = structuredClone(previous);
    next.focusSessions[0].context.taskTitle = 'Rewrite history';
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
      'cannot be rewritten',
    );
  });
  it('rejects removing completed history on import', () => {
    const previous = completed();
    const next = structuredClone(previous);
    next.focusSessions = [];
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
      'must be preserved',
    );
  });
  it("rejects recording a different actor's completion", () => {
    const next = completed();
    expect(() => validateDocumentChange(null, next, other, members)).toThrow('own focus');
  });
  it('rejects rewriting active context when completing', () => {
    const previous = startTimer(createEmptyData(), { durationMinutes: 1 }, actor, stamp);
    const next = completeTimer(previous, stamp + 60_000);
    next.focusSessions[0].context.subjectName = 'Different subject';
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
      'original timer context',
    );
  });
  it('rejects changing a running timer duration', () => {
    const previous = startTimer(createEmptyData(), { durationMinutes: 1 }, actor, stamp);
    const next = structuredClone(previous);
    next.timer.durationMs = 120000;
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow('frozen');
  });
  it("protects other members' planned sessions from deletion", () => {
    const previous = createEmptyData();
    previous.plannedSessions.push({
      id: id(),
      workspaceId: previous.workspaceId,
      userId: other,
      title: 'Member work',
      startsAt: new Date(stamp).toISOString(),
      durationMinutes: 25,
      notes: '',
      completed: false,
      createdAt: new Date(stamp).toISOString(),
      updatedAt: new Date(stamp).toISOString(),
    });
    const next = structuredClone(previous);
    next.plannedSessions = [];
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow('another member');
  });
  it('rejects assigning work to an outsider', () => {
    const next = createEmptyData();
    next.tasks.push({
      id: id(),
      workspaceId: next.workspaceId,
      title: 'Task',
      description: '',
      status: 'todo',
      priority: 'medium',
      tags: [],
      estimatedPomodoros: 1,
      assigneeId: id(),
      checklist: [],
      resources: [],
      createdAt: new Date(stamp).toISOString(),
      updatedAt: new Date(stamp).toISOString(),
    });
    expect(() => validateDocumentChange(null, next, actor, members)).toThrow(
      'current workspace member',
    );
  });
  it('preserves journal revision content', () => {
    const previous = createEmptyData();
    previous.journal.push({
      id: id(),
      taskId: id(),
      workspaceId: previous.workspaceId,
      userId: actor,
      kind: 'progress',
      content: 'Original finding',
      revisions: [],
      createdAt: new Date(stamp).toISOString(),
      updatedAt: new Date(stamp).toISOString(),
    });
    const next = structuredClone(previous);
    next.journal[0].content = 'Updated finding';
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
      'revision history',
    );
    next.journal[0].revisions.push({
      content: 'Original finding',
      editedAt: new Date(stamp + 1000).toISOString(),
    });
    expect(() => validateDocumentChange(previous, next, actor, members)).not.toThrow();
  });
});

describe('authenticated request guards', () => {
  it('rejects cross-site origins and missing origins', () => {
    expect(() =>
      assertSameOrigin(
        new Request('http://localhost/api/sync', { headers: { origin: 'https://attacker.test' } }),
      ),
    ).toThrow('come from Folia');
    expect(() => assertSameOrigin(new Request('http://localhost/api/sync'))).toThrow(
      'come from Folia',
    );
    expect(() =>
      assertSameOrigin(
        new Request('http://localhost/api/sync', { headers: { origin: 'http://localhost' } }),
      ),
    ).not.toThrow();
  });
  it('validates body size even when content-length is missing', async () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'A'.repeat(100) }),
    });
    await expect(readJson(request, 30)).rejects.toThrow('too large');
  });
  it('rejects malformed JSON before any mutation', async () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    await expect(readJson(request)).rejects.toThrow('invalid JSON');
  });
});
