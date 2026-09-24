import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createEmptyData, id, type WorkspaceData } from '../src/lib/model';

async function dataFor(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
}
async function openMood(page: Page, view = 'mood', timeZone = 'UTC') {
  const data = createEmptyData();
  data.preferences.timeZone = timeZone;
  data.preferences.appearance = 'light';
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
  await page.goto(`/?view=${view}`);
  await expect(page.locator('.app-shell')).toBeVisible();
  return data;
}

test('a mood entry can be saved, edited and deleted without changing productivity history', async ({
  page,
}) => {
  const initial = await openMood(page);
  await page.getByRole('button', { name: 'Humeur : Bien', exact: true }).click();
  await page.getByLabel('Votre énergie', { exact: true }).selectOption('4');
  await page
    .getByLabel('Quelques mots sur votre journée', { exact: true })
    .fill('Une séance utile, une promenade ensuite.');
  await page.getByRole('button', { name: 'Enregistrer mon humeur', exact: true }).click();
  await expect.poll(async () => (await dataFor(page)).preferences.moodEntries.length).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Humeur : Bien', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Quelques mots sur votre journée', { exact: true })).toHaveValue(
    'Une séance utile, une promenade ensuite.',
  );
  await page.getByRole('button', { name: 'Humeur : Très bien', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer mon humeur', exact: true }).click();
  await expect.poll(async () => (await dataFor(page)).preferences.moodEntries[0].mood).toBe(5);
  expect((await dataFor(page)).preferences.moodEntries).toHaveLength(1);
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer la suppression', exact: true }).click();
  await expect.poll(async () => (await dataFor(page)).preferences.moodEntries).toEqual([]);
  const final = await dataFor(page);
  expect(final.events).toEqual(initial.events);
  expect(final.focusSessions).toEqual(initial.focusSessions);
  expect(final.tasks).toEqual(initial.tasks);
  await expect(page.locator('[data-mood-day="2026-09-24"]')).toHaveAttribute(
    'data-recorded',
    'false',
  );
});

test('overview check-in, workspace isolation and empty dates stay honest', async ({ page }) => {
  const original = await openMood(page, 'overview');
  await page.getByRole('button', { name: 'Humeur : Neutre', exact: true }).click();
  await expect.poll(async () => (await dataFor(page)).preferences.moodEntries.length).toBe(1);
  await page.getByRole('button', { name: 'Mon suivi d’humeur', exact: true }).click();
  await expect(page.getByLabel('Date du point d’humeur', { exact: true })).toHaveValue(
    '2026-09-24',
  );
  await expect(page.locator('[data-mood-day="2026-09-23"]')).toHaveAttribute(
    'data-recorded',
    'false',
  );
  await expect(page.locator('[data-mood-day="2026-09-25"]')).toBeDisabled();
  const second = createEmptyData(id());
  await page.evaluate(
    ({ data, operationId }) => {
      localStorage.setItem(
        `folia:v1:local:${data.workspaceId}`,
        JSON.stringify({ version: 1, operationId, data }),
      );
      localStorage.setItem('folia:v1:active-local', data.workspaceId);
    },
    { data: second, operationId: id() },
  );
  await page.reload();
  await expect(page.locator('[data-mood-day="2026-09-24"]')).toHaveAttribute(
    'data-recorded',
    'false',
  );
  expect((await dataFor(page)).preferences.moodEntries).toEqual([]);
  const oldCount = await page.evaluate(
    (workspace) =>
      JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data.preferences.moodEntries
        .length,
    original.workspaceId,
  );
  expect(oldCount).toBe(1);
});

test('month navigation supports leap days, zoned dates, keyboard input and mobile accessibility', async ({
  page,
}) => {
  await openMood(page, 'mood', 'Pacific/Pago_Pago');
  await expect(page.getByLabel('Date du point d’humeur', { exact: true })).toHaveValue(
    '2026-09-23',
  );
  await expect(page.locator('[data-mood-day="2026-09-24"]')).toBeDisabled();
  await page.getByLabel('Mois du suivi d’humeur').fill('2024-02');
  await expect(page.locator('[data-mood-day]')).toHaveCount(29);
  await page.locator('[data-mood-day="2024-02-29"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Date du point d’humeur', { exact: true })).toHaveValue(
    '2024-02-29',
  );
  await page.getByRole('button', { name: 'Humeur : Difficile', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Enregistrer mon humeur', exact: true }).click();
  await expect
    .poll(async () => (await dataFor(page)).preferences.moodEntries[0]?.date)
    .toBe('2024-02-29');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
  for (const mode of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== mode)
      await page.getByRole('button', { name: 'Basculer entre le mode clair et sombre' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((node) => node.html),
      })),
    ).toEqual([]);
  }
});

test('a local mood check-in survives an offline production reload', async ({ page, context }) => {
  test.skip(process.env.PLAYWRIGHT_PWA !== '1', 'Production service worker required.');
  await openMood(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Humeur : Bien', exact: true }).click();
  await page
    .getByLabel('Quelques mots sur votre journée', { exact: true })
    .fill('Un moment hors ligne.');
  await page.getByRole('button', { name: 'Enregistrer mon humeur', exact: true }).click();
  await expect
    .poll(async () => (await dataFor(page)).preferences.moodEntries[0]?.note)
    .toBe('Un moment hors ligne.');
  await page.reload();
  await expect(page.getByLabel('Quelques mots sur votre journée', { exact: true })).toHaveValue(
    'Un moment hors ligne.',
  );
  await context.setOffline(false);
});
