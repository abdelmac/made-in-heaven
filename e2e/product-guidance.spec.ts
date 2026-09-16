import { expect, test } from '@playwright/test';

test('French first-use flow creates one linked objective and exposes an honest personal summary', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.locator('.demo-notice button').click();
  await page.getByRole('button', { name: 'Créer mon premier objectif' }).click();
  const dialog = page.getByRole('dialog', { name: 'Préparer mon premier objectif' });
  await dialog.getByLabel('1. Ma matière ou mon objectif').fill('Mon japonais');
  await dialog.getByLabel('2. Ma première tâche').fill('Réviser les hiragana');
  await dialog.getByLabel('Date', { exact: true }).fill('2026-10-05');
  await dialog.getByLabel('Heure', { exact: true }).fill('18:30');
  await dialog.getByRole('button', { name: 'Créer et voir mon planning' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Planning');
  const data = await page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
  expect(data.subjects).toHaveLength(1);
  expect(data.tasks).toHaveLength(1);
  expect(data.plannedSessions).toHaveLength(1);
  expect(data.plannedSessions[0].taskId).toBe(data.tasks[0].id);
  expect(data.focusSessions).toHaveLength(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mon bilan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer mon premier objectif' })).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Période du bilan' })
    .getByRole('button', { name: 'Aujourd’hui' })
    .click();
  await expect(page.getByRole('button', { name: 'Aujourd’hui', pressed: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
