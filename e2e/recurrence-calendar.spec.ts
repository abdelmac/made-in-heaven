import { expect, test, type Page } from '@playwright/test';
import { createDemoData, id, type WorkspaceData } from '../src/lib/model';
import { en } from '../src/lib/i18n/en';

async function readData(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
}

test('recurring tasks and plans persist, later conflicts are atomic, and the visible week downloads', async ({
  page,
}) => {
  const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
  data.preferences.timeZone = 'Europe/Paris';
  data.plannedSessions = [];
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

  await page.goto('/?view=tasks');
  await page.getByRole('button', { name: en.tasks.add, exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.tasks.titleField, { exact: true }).fill('Réviser les maths');
  await dialog.getByLabel(en.tasks.due, { exact: true }).fill('2026-09-14');
  await dialog.getByRole('combobox', { name: 'Répéter', exact: true }).selectOption('weekly');
  await dialog.getByLabel("Nombre d'occurrences (première incluse)").fill('3');
  await dialog.getByRole('button', { name: en.tasks.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  let savedTasks = (await readData(page)).tasks.filter(
    (task) => task.title === 'Réviser les maths',
  );
  expect(savedTasks.map((task) => task.dueDate)).toEqual([
    '2026-09-14',
    '2026-09-21',
    '2026-09-28',
  ]);
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  savedTasks = (await readData(page)).tasks.filter((task) => task.title === 'Réviser les maths');
  expect(new Set(savedTasks.map((task) => task.id)).size).toBe(3);

  await page.goto('/?view=planner');
  await page.getByRole('button', { name: en.planner.add, exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.planner.titleField, { exact: true }).fill('Concentration quotidienne');
  await dialog.getByLabel(en.planner.date, { exact: true }).fill('2026-09-14');
  await dialog.getByLabel(en.planner.time, { exact: true }).fill('09:00');
  await dialog.getByRole('combobox', { name: 'Répéter', exact: true }).selectOption('daily');
  await dialog.getByLabel("Nombre d'occurrences (première incluse)").fill('3');
  await dialog.getByRole('button', { name: en.planner.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await readData(page)).plannedSessions.map((session) => session.startsAt)).toEqual([
    '2026-09-14T07:00:00.000Z',
    '2026-09-15T07:00:00.000Z',
    '2026-09-16T07:00:00.000Z',
  ]);

  await page.getByRole('button', { name: en.planner.add, exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.planner.titleField, { exact: true }).fill('Série en conflit');
  await dialog.getByLabel(en.planner.date, { exact: true }).fill('2026-09-12');
  await dialog.getByLabel(en.planner.time, { exact: true }).fill('09:00');
  await dialog.getByRole('combobox', { name: 'Répéter', exact: true }).selectOption('daily');
  await dialog.getByLabel("Nombre d'occurrences (première incluse)").fill('3');
  await dialog.getByRole('button', { name: en.planner.add, exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('chevauche');
  expect((await readData(page)).plannedSessions).toHaveLength(3);
  expect((await readData(page)).focusSessions).toHaveLength(0);
  await dialog.getByRole('button', { name: en.common.cancel, exact: true }).click();

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter ma semaine (.ics)', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('solace-planning-2026-09-14-2026-09-20.ics');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const calendar = Buffer.concat(chunks).toString('utf8').replace(/\r\n /g, '');
  expect(calendar.match(/^BEGIN:VEVENT$/gm)).toHaveLength(3);
  expect(calendar).toContain('SUMMARY:Concentration quotidienne');
  expect(calendar).toContain('DTSTART:20260914T070000Z');
  await page.reload();
  await expect(page.locator('.full-planner')).toBeVisible();
  expect((await readData(page)).plannedSessions).toHaveLength(3);
});
