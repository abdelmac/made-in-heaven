import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceData } from '../src/lib/model';

async function readData(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    const raw = localStorage.getItem(`folia:v1:local:${workspace}`);
    if (!raw) throw new Error('The local workspace has not been persisted.');
    return JSON.parse(raw).data;
  });
}
async function openView(page: Page, view: string) {
  await page.goto(`/?view=${view}`);
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.breadcrumb strong')).toHaveText(
    {
      overview: 'Overview',
      subjects: 'Subjects',
      tasks: 'Tasks',
      planner: 'Planner',
      settings: 'Settings',
      history: 'History',
      analytics: 'Analytics',
    }[view] || view,
  );
}
async function startFresh(page: Page) {
  await openView(page, 'settings');
  await page
    .locator('.settings-tabs')
    .getByRole('button', { name: 'Your data', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start fresh', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start with a clean workspace?' });
  await dialog.getByRole('button', { name: 'Start fresh', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await readData(page)).subjects.length).toBe(0);
}

test('a complete personal journey preserves planning, development and actual focus history', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.clock.install({ time: new Date('2026-09-14T08:00:00Z') });
  await startFresh(page);
  await openView(page, 'subjects');
  await page.getByRole('button', { name: 'New subject', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Subject name', { exact: true }).fill('Interface research');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Understand what helps people stay focused.');
  await dialog.getByRole('button', { name: 'New subject', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Interface research', exact: true })).toBeVisible();

  await openView(page, 'tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Task title', { exact: true }).fill('Draft the interface');
  await dialog
    .getByRole('combobox', { name: 'Subject', exact: true })
    .selectOption({ label: 'Interface research' });
  await dialog
    .getByLabel('Description (Markdown supported)', { exact: true })
    .fill('## Acceptance criteria\n\nA clear, readable first draft.');
  await dialog.getByLabel('Estimated Pomodoros').fill('2');
  await dialog.getByRole('button', { name: 'New task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /^Draft the interface/ }).click();
  dialog = page.getByRole('dialog', { name: 'Draft the interface', exact: true });
  await dialog.getByRole('button', { name: 'Subtasks', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Add a subtask', exact: true })
    .fill('Capture the main flow');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  const checklistItem = dialog.getByRole('checkbox', { name: 'Capture the main flow' });
  await checklistItem.click();
  await expect(checklistItem).toBeChecked();
  await expect(dialog.getByText('1 of 1 complete')).toBeVisible();
  await dialog.getByRole('button', { name: 'Development', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Development note', exact: true })
    .fill('Found a simpler layout. Next: test the timer controls.');
  await dialog.getByRole('button', { name: 'Add development note', exact: true }).click();
  await expect(
    dialog.getByText('Found a simpler layout. Next: test the timer controls.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await openView(page, 'planner');
  await page.getByRole('button', { name: 'Plan a session', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Session title').fill('One focused design minute');
  await dialog.getByLabel('Date', { exact: true }).fill('2026-09-14');
  await dialog.getByLabel('Start time').fill('10:00');
  await dialog.getByLabel('Duration (minutes)').fill('1');
  await dialog
    .getByRole('combobox', { name: 'Task title', exact: true })
    .selectOption({ label: 'Draft the interface' });
  await dialog.getByRole('button', { name: 'Plan a session', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await readData(page)).focusSessions).toHaveLength(0);
  await page.getByRole('button', { name: /One focused design minute/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Focus now', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await openView(page, 'overview');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.fastForward(15000);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  const paused = (await readData(page)).timer;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect((await readData(page)).timer.remainingMs).toBe(paused.remainingMs);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.fastForward(61000);
  await expect
    .poll(
      async () =>
        (await readData(page)).focusSessions.filter(
          (session) => session.status === 'completed' && session.phase === 'focus',
        ).length,
    )
    .toBe(1);
  const completed = await readData(page);
  expect(completed.timer).toMatchObject({ phase: 'shortBreak', status: 'idle', cycleCount: 1 });
  expect(completed.focusSessions[0].context).toMatchObject({
    taskTitle: 'Draft the interface',
    subjectName: 'Interface research',
  });
  expect(completed.plannedSessions[0].completed).toBe(true);
  expect(completed.tasks[0].status).toBe('todo');
  expect(completed.journal).toHaveLength(1);
  await page.getByRole('button', { name: 'Add session note', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'New note', exact: true });
  await dialog
    .getByLabel('Note content (Markdown supported)', { exact: true })
    .fill('The timer controls are clearer after this focus session.');
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const reflection = (await readData(page)).noteSheets[0];
  expect(reflection.sessionId).toBe(completed.focusSessions[0].id);
  expect(reflection.subjectId).toBe(completed.focusSessions[0].context.subjectId);
  expect(reflection.kind).toBe('session_reflection');
  await openView(page, 'history');
  await expect(
    page.locator('.history-panel').getByText('focus completed', { exact: true }),
  ).toBeVisible();
  await openView(page, 'subjects');
  await page.getByRole('button', { name: 'Interface research', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Subject history', exact: true }).click();
  await expect(dialog.getByText('focus completed', { exact: true })).toBeVisible();
});

test('overlap errors retain the editor and preserve the original plan', async ({ page }) => {
  await startFresh(page);
  await openView(page, 'planner');
  for (const title of ['First block', 'Conflicting block']) {
    await page.getByRole('button', { name: 'Plan a session', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Session title').fill(title);
    await dialog.getByLabel('Date', { exact: true }).fill('2026-09-14');
    await dialog.getByLabel('Start time').fill('09:45');
    await dialog.getByLabel('Duration (minutes)').fill('30');
    await dialog.getByRole('button', { name: 'Plan a session', exact: true }).click();
    if (title === 'First block') await expect(dialog).not.toBeVisible();
    else {
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('alert')).toContainText('overlap');
    }
  }
  expect((await readData(page)).plannedSessions.map((session) => session.title)).toEqual([
    'First block',
  ]);
});

test('local development templates create a checklist without inventing analytics', async ({
  page,
}) => {
  await startFresh(page);
  await openView(page, 'tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Task title', { exact: true }).fill('Build the settings screen');
  await dialog.getByLabel('Start with a template').selectOption('Software development');
  await expect(
    dialog.getByRole('textbox', { name: 'Description (Markdown supported)', exact: true }),
  ).toHaveValue(/Acceptance criteria/);
  await dialog.getByRole('button', { name: 'New task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const data = await readData(page);
  expect(data.tasks[0].checklist.map((item) => item.text)).toEqual([
    'Clarify acceptance criteria',
    'Implement the change',
    'Add meaningful tests',
    'Run checks',
    'Review the result',
  ]);
  expect(new Set(data.tasks[0].checklist.map((item) => item.id)).size).toBe(5);
  expect(data.focusSessions).toHaveLength(0);
  await openView(page, 'analytics');
  await expect(page.getByRole('heading', { name: 'Focus by subject', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Focus by project', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Build the settings screen' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').nth(2)).toHaveText('0');
  await expect(row.getByRole('cell').nth(3)).toHaveText('0m');
});

test('appearance persists, invalid imports change no data, and dialogs restore focus', async ({
  page,
}) => {
  await startFresh(page);
  await openView(page, 'settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .locator('.settings-tabs')
    .getByRole('button', { name: 'Your data', exact: true })
    .click();
  const before = await readData(page);
  await page.getByLabel('Import JSON file', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'folia-productivity',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: { ...before, entitlements: { plan: 'team' } },
      }),
    ),
  });
  await expect(page.getByRole('dialog', { name: 'Review your import' })).not.toBeVisible();
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect(await readData(page)).toEqual(before);
  await openView(page, 'tasks');
  const trigger = page.getByRole('button', { name: 'New task', exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Task title', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('two tabs recover the same session without duplicate completions', async ({
  page,
  context,
}) => {
  const instant = new Date('2026-09-14T08:00:00Z');
  await page.clock.install({ time: instant });
  await startFresh(page);
  await page.locator('.settings-tabs').getByRole('button', { name: 'Timer', exact: true }).click();
  await page.getByLabel('Focus (minutes)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await openView(page, 'overview');
  const other = await context.newPage();
  await other.clock.install({ time: instant });
  await openView(other, 'overview');
  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const sessionId = (await readData(page)).timer.sessionId;
  expect((await readData(other)).timer.sessionId).toBe(sessionId);
  await page.clock.fastForward(61000);
  await other.clock.fastForward(61000);
  await expect.poll(async () => (await readData(page)).focusSessions.length).toBe(1);
  await other.reload();
  await expect(other.locator('.app-shell')).toBeVisible();
  expect((await readData(other)).focusSessions.map((session) => session.id)).toEqual([sessionId]);
  await other.close();
});

test('reset and skip require confirmation and never count as completed Pomodoros', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-14T08:00:00Z') });
  await startFresh(page);
  await openView(page, 'overview');
  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  await page.clock.fastForward(30000);
  await page.getByRole('button', { name: 'Reset timer', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Reset this session?' });
  await expect(dialog).toBeVisible();
  expect((await readData(page)).focusSessions).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Reset timer', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Skip phase', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Skip this session?' });
  await dialog.getByRole('button', { name: 'Skip phase', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const data = await readData(page);
  expect(data.focusSessions.map((session) => session.status)).toEqual(['interrupted', 'skipped']);
  expect(data.timer).toMatchObject({ phase: 'shortBreak', status: 'idle', cycleCount: 0 });
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`layout keeps page content within the ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['overview', 'tasks', 'planner', 'subjects', 'settings']) {
      await openView(page, view);
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        body: document.body.scrollWidth,
      }));
      expect(overflow.document, `${view} document width`).toBeLessThanOrEqual(width + 1);
      expect(overflow.body, `${view} body width`).toBeLessThanOrEqual(width + 1);
    }
    await openView(page, 'overview');
    await expect(page.getByRole('button', { name: 'Start focus', exact: true })).toBeVisible();
  });
}
