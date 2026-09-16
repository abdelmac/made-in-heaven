import { expect, test, type Page } from '@playwright/test';
import { createDemoData, id, type WorkspaceData } from '../src/lib/model';
import { contrastRatio } from '../src/lib/calendar';

test.use({ viewport: { width: 1280, height: 1200 } });

async function readData(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
}

async function openPlanner(page: Page) {
  const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
  data.preferences.timeZone = 'UTC';
  data.preferences.timeFormat = '24h';
  data.preferences.focusMinutes = 40;
  data.preferences.appearance = 'light';
  data.preferences.accentColor = '#000000';
  data.plannedSessions = data.plannedSessions.slice(0, 2);
  Object.assign(data.plannedSessions[0], {
    startsAt: '2026-09-14T09:15:00.000Z',
    durationMinutes: 45,
    notes: 'Keep these details',
  });
  Object.assign(data.plannedSessions[1], {
    startsAt: '2026-09-14T11:00:00.000Z',
    durationMinutes: 60,
  });
  await page.clock.install({ time: new Date('2026-09-14T08:00:00Z') });
  await page.addInitScript(
    ({ data, operationId }) => {
      const key = `folia:v1:local:${data.workspaceId}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem('folia:v1:active-local', data.workspaceId);
        localStorage.setItem(key, JSON.stringify({ version: 1, operationId, data }));
      }
    },
    { data, operationId: id() },
  );
  await page.goto('/?view=planner');
  await expect(page.locator('.full-planner')).toBeVisible();
  return data;
}

test('dragging a session moves its date/time and preserves its context after reload', async ({
  page,
}) => {
  const data = await openPlanner(page);
  const original = data.plannedSessions[0];
  await page
    .locator(`[data-plan-id="${original.id}"]`)
    .dragTo(page.locator('[data-planner-slot="2026-09-15:13"]'));
  await expect
    .poll(async () => (await readData(page)).plannedSessions[0].startsAt)
    .toBe('2026-09-15T13:00:00.000Z');
  const saved = (await readData(page)).plannedSessions[0];
  expect(saved).toMatchObject({
    ...original,
    startsAt: '2026-09-15T13:00:00.000Z',
    updatedAt: saved.updatedAt,
  });
  expect(
    (await readData(page)).events.filter((event) => event.type === 'plan_updated'),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.locator('[data-planner-slot="2026-09-15:13"]')).toHaveAccessibleName(
    /45 planned minutes/,
  );
  expect((await readData(page)).focusSessions).toHaveLength(0);
  for (const mode of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== mode)
      await page.getByRole('button', { name: "Basculer entre le mode clair et sombre" }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    const colors = await page.locator('[data-planner-slot="2026-09-15:13"]').evaluate((cell) => {
      const style = getComputedStyle(cell);
      const hex = (rgb: string) =>
        '#' +
        rgb
          .match(/\d+/g)!
          .slice(0, 3)
          .map((channel) => Number(channel).toString(16).padStart(2, '0'))
          .join('');
      return { text: hex(style.color), background: hex(style.backgroundColor) };
    });
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
  }
});

test('an overlapping drop keeps the original session and reports the conflict', async ({
  page,
}) => {
  const data = await openPlanner(page);
  const original = data.plannedSessions[0];
  await page
    .locator(`[data-plan-id="${original.id}"]`)
    .dragTo(page.locator('[data-planner-slot="2026-09-14:11"]'));
  await expect(page.locator('.full-planner').getByRole('alert')).toContainText('overlap');
  expect((await readData(page)).plannedSessions[0]).toEqual(original);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: "Annuler le déplacement", exact: true })).toHaveCount(0);
});

test('a foreign drag payload cannot change the schedule', async ({ page }) => {
  const data = await openPlanner(page);
  const payload = await page.evaluateHandle((planId) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-solace-planner', planId);
    return transfer;
  }, data.plannedSessions[0].id);
  const target = page.locator('[data-planner-slot="2026-09-15:13"]');
  await target.dispatchEvent('dragover', { dataTransfer: payload });
  await target.dispatchEvent('drop', { dataTransfer: payload });
  expect((await readData(page)).plannedSessions).toEqual(data.plannedSessions);
  expect((await readData(page)).events).toHaveLength(0);
  await payload.dispose();
});

test('tasks can be dragged to the grid and sessions can also move using the keyboard', async ({
  page,
}) => {
  const data = await openPlanner(page);
  const task = data.tasks[2];
  await page
    .locator(`[data-task-id="${task.id}"]`)
    .dragTo(page.locator('[data-planner-slot="2026-09-14:14"]'));
  await expect.poll(async () => (await readData(page)).plannedSessions.length).toBe(3);
  const planned = (await readData(page)).plannedSessions.find((plan) => plan.taskId === task.id)!;
  expect(planned).toMatchObject({
    title: task.title,
    subjectId: task.subjectId,
    durationMinutes: 40,
    startsAt: '2026-09-14T14:00:00.000Z',
    completed: false,
  });
  await page.getByRole('button', { name: `Move ${task.title}`, exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-planner-slot="2026-09-16:15"]').focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(
      async () =>
        (await readData(page)).plannedSessions.find((plan) => plan.id === planned.id)?.startsAt,
    )
    .toBe('2026-09-16T15:00:00.000Z');
  await page.locator(`[data-plan-id="${planned.id}"]`).click();
  await expect(page.getByRole('dialog').getByLabel("Durée (minutes)")).toHaveValue('40');
});

test.describe('touch planning', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('a task and slot can be tapped without disabling horizontal grid scrolling', async ({
    page,
  }) => {
    const data = await openPlanner(page);
    await page.locator(`[data-task-id="${data.tasks[2].id}"]`).tap();
    await page.locator('[data-planner-slot="2026-09-16:14"]').tap();
    await expect.poll(async () => (await readData(page)).plannedSessions.length).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      391,
    );
    const scroller = page.locator('.full-planner .grid-scroller');
    expect(await scroller.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await scroller.evaluate((node) => {
      node.scrollLeft = 80;
    });
    expect(await scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });
});
