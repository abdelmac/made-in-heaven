import { expect, test, type Page } from '@playwright/test';
import { createDemoData, id, type WorkspaceData } from '../src/lib/model';
import { en } from '../src/lib/i18n/en';
import { calendarCopy as copy } from '../src/lib/i18n/planner-calendar';

async function readData(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
}

async function openCalendar(page: Page) {
  const data = createDemoData(new Date('2026-09-24T08:00:00Z'));
  data.preferences.timeZone = 'UTC';
  data.preferences.weekStartsOn = 1;
  data.preferences.focusMinutes = 40;
  data.plannedSessions = data.plannedSessions.slice(0, 1);
  data.plannedSessions[0].startsAt = '2026-09-24T09:00:00.000Z';
  data.plannedSessions[0].title = 'Préparer le prochain chapitre';
  data.tasks[0].dueDate = '2026-09-24';
  data.tasks[1].dueDate = '2026-09-25';
  data.tasks[1].title = 'Finaliser la maquette';
  data.tasks[2].dueDate = '2026-10-03';
  await page.clock.install({ time: new Date('2026-09-24T08:00:00Z') });
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

test('month and agenda show planned focus and deadlines without changing workspace data', async ({
  page,
}) => {
  const fixture = await openCalendar(page);
  const views = page.getByRole('group', { name: copy.views, exact: true });
  await expect(views.getByRole('button', { name: copy.week, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-week-due]')).toHaveCount(2);
  await views.getByRole('button', { name: copy.month, exact: true }).click();
  await expect(page.locator('[data-calendar-day]')).toHaveCount(30);
  await expect(page.locator('[data-calendar-day="2026-09-24"]')).toHaveAccessibleName(
    /1 séance\(s\), 1 échéance\(s\), 25 minutes/,
  );
  await expect(
    page.locator(`[data-calendar-plan="${fixture.plannedSessions[0].id}"]`),
  ).toBeVisible();
  await expect(page.locator(`[data-calendar-task="${fixture.tasks[0].id}"]`)).toBeVisible();
  await page.locator(`[data-calendar-plan="${fixture.plannedSessions[0].id}"]`).click();
  await expect(
    page.getByRole('dialog').getByLabel(en.planner.titleField, { exact: true }),
  ).toHaveValue('Préparer le prochain chapitre');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: en.common.cancel, exact: true })
    .click();
  await page.getByRole('button', { name: copy.nextMonth, exact: true }).click();
  await expect(page.getByLabel(copy.chooseMonth)).toHaveValue('2026-10');
  await page.locator('[data-calendar-day="2026-10-03"]').click();
  await expect(page.locator(`[data-calendar-task="${fixture.tasks[2].id}"]`)).toBeVisible();
  await page.getByLabel(copy.chooseMonth).fill('2024-02');
  await expect(page.locator('[data-calendar-day]')).toHaveCount(29);
  await page.getByRole('button', { name: en.planner.today, exact: true }).click();
  await views.getByRole('button', { name: copy.agenda, exact: true }).click();
  await expect(page.locator('[data-agenda-day]')).toHaveCount(7);
  await expect(page.locator('[data-agenda-day="2026-09-24"] [data-calendar-plan]')).toHaveCount(1);
  await expect(page.locator('[data-agenda-day="2026-09-25"] [data-calendar-task]')).toHaveCount(1);
  expect((await readData(page)).plannedSessions).toEqual(fixture.plannedSessions);
  expect((await readData(page)).tasks).toEqual(fixture.tasks);
});

test('a due task opens a prefilled recurring plan and month export uses the displayed range', async ({
  page,
}) => {
  const fixture = await openCalendar(page);
  await page
    .getByRole('group', { name: copy.views })
    .getByRole('button', { name: copy.month, exact: true })
    .click();
  await page.locator('[data-calendar-day="2026-09-25"]').click();
  await page
    .getByRole('button', { name: `${copy.scheduleTask} : Finaliser la maquette`, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(en.planner.titleField, { exact: true })).toHaveValue(
    'Finaliser la maquette',
  );
  await expect(dialog.getByLabel(en.planner.date, { exact: true })).toHaveValue('2026-09-25');
  await expect(dialog.getByLabel(en.planner.duration, { exact: true })).toHaveValue('40');
  await expect(
    dialog.getByRole('combobox', { name: en.tasks.titleField, exact: true }),
  ).toHaveValue(fixture.tasks[1].id);
  await dialog.getByRole('combobox', { name: 'Répéter', exact: true }).selectOption('daily');
  await dialog.getByLabel("Nombre d'occurrences (première incluse)").fill('2');
  await dialog.getByRole('button', { name: en.planner.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const plans = (await readData(page)).plannedSessions.filter(
    (plan) => plan.taskId === fixture.tasks[1].id,
  );
  expect(plans.map((plan) => plan.startsAt)).toEqual([
    '2026-09-25T09:00:00.000Z',
    '2026-09-26T09:00:00.000Z',
  ]);
  expect(
    plans.every(
      (plan) => plan.subjectId === fixture.tasks[1].subjectId && plan.durationMinutes === 40,
    ),
  ).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: copy.exportMonth, exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('solace-planning-2026-09-01-2026-09-30.ics');
  expect((await readData(page)).focusSessions).toHaveLength(0);
});

test('month keyboard navigation crosses month boundaries and the calendar fits mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendar(page);
  await page
    .getByRole('group', { name: copy.views })
    .getByRole('button', { name: copy.month, exact: true })
    .click();
  await page.locator('[data-calendar-day="2026-09-30"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel(copy.chooseMonth)).toHaveValue('2026-10');
  await expect(page.locator('[data-calendar-day="2026-10-01"]')).toBeFocused();
  await expect(page.locator('[data-calendar-day="2026-10-01"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    );
  }
  await page.getByRole('button', { name: copy.weekLink, exact: true }).click();
  await expect(page.locator('[data-planner-slot="2026-10-01:9"]')).toBeVisible();
});
