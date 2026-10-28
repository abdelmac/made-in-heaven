import { expect, test, type Download, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { WorkspaceData } from '../../src/lib/model';
import { en } from '../../src/lib/i18n/en';

async function data(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
}

async function downloadText(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The exported file is unavailable.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function open(page: Page, view = 'overview') {
  await page.goto(`/?view=${view}`);
  await expect(page.locator('.app-shell')).toBeVisible();
}

test('bundled app opens the workspace and fits small screens with accessible controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#home-title')).toHaveCount(0);
  await expect(page.getByRole('button', { name: en.timer.start, exact: true })).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => node.html),
    })),
  ).toEqual([]);
  await page.screenshot({ path: '.local/previews/mobile-workspace-390.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('timer recovery and offline task editing preserve local work', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-10-27T08:00:00Z') });
  await open(page);
  await page.getByRole('button', { name: en.timer.start, exact: true }).click();
  await expect.poll(async () => (await data(page)).timer.status).toBe('running');
  await page.clock.fastForward(15_000);
  await page.getByRole('button', { name: en.timer.pause, exact: true }).click();
  await expect.poll(async () => (await data(page)).timer.status).toBe('paused');
  const paused = (await data(page)).timer;
  expect(paused.status).toBe('paused');
  expect(paused.remainingMs).toBeLessThan(paused.durationMs);
  await page.reload();
  await expect(page.getByRole('button', { name: en.timer.resume, exact: true })).toBeVisible();
  expect((await data(page)).timer).toMatchObject({
    sessionId: paused.sessionId,
    status: 'paused',
    remainingMs: paused.remainingMs,
  });
  // The installed app bundles these assets. Here we exercise an already loaded
  // mobile interface offline, then restore connectivity before an HTTP reload.
  await context.setOffline(true);
  await page
    .getByRole('navigation', { name: 'Navigation mobile' })
    .getByRole('button', { name: en.navigation.tasks, exact: true })
    .click();
  await page.getByRole('button', { name: en.tasks.add, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.tasks.titleField, { exact: true }).fill('Mobile offline task');
  await dialog.getByRole('button', { name: en.tasks.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await data(page)).tasks.some((task) => task.title === 'Mobile offline task')).toBe(true);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Mobile offline task/ })).toBeVisible();
  expect((await data(page)).timer.sessionId).toBe(paused.sessionId);
  expect((await data(page)).focusSessions).toHaveLength(0);
});

test('new tasks and scheduled work appear in JSON backup and calendar downloads', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-27T08:00:00Z') });
  await open(page, 'settings');
  await page
    .locator('.settings-tabs')
    .getByRole('button', { name: 'Vos données', exact: true })
    .click();
  await page.getByRole('button', { name: 'Repartir de zéro', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Repartir avec un espace vide ?' });
  await dialog.getByRole('button', { name: 'Repartir de zéro', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await open(page, 'tasks');
  await page.getByRole('button', { name: en.tasks.add, exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.tasks.titleField, { exact: true }).fill('Réviser sur mobile');
  await dialog.getByRole('button', { name: en.tasks.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await open(page, 'planner');
  await page.getByRole('button', { name: en.planner.add, exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.planner.titleField, { exact: true }).fill('Ma séance mobile');
  await dialog.getByLabel(en.planner.date, { exact: true }).fill('2026-10-27');
  await dialog.getByLabel(en.planner.time, { exact: true }).fill('13:30');
  await dialog
    .getByRole('combobox', { name: en.tasks.titleField, exact: true })
    .selectOption({ label: 'Réviser sur mobile' });
  await dialog.getByRole('button', { name: en.planner.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const calendarPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter ma semaine (.ics)', exact: true }).click();
  const calendarDownload = await calendarPromise;
  expect(calendarDownload.suggestedFilename()).toMatch(/^solace-planning-.*\.ics$/);
  const calendar = await downloadText(calendarDownload);
  expect(calendar).toContain('SUMMARY:Ma séance mobile');
  expect(calendar).toContain('BEGIN:VEVENT');
  await open(page, 'settings');
  await page
    .locator('.settings-tabs')
    .getByRole('button', { name: 'Vos données', exact: true })
    .click();
  const backupPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: en.settings.export, exact: true }).click();
  const backup = JSON.parse(await downloadText(await backupPromise));
  expect(backup.format).toBe('folia-productivity');
  expect(backup.data.tasks).toHaveLength(1);
  expect(backup.data.tasks[0].title).toBe('Réviser sur mobile');
  expect(backup.data.plannedSessions[0].taskId).toBe(backup.data.tasks[0].id);
  expect(backup.data.focusSessions).toHaveLength(0);
});

test('mobile billing has no web purchase or portal actions even when web prices exist', async ({
  page,
}) => {
  const purchases: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/billing\/(checkout|portal)/.test(request.url())) purchases.push(request.url());
  });
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({
      json: {
        configured: true,
        checkoutEnabled: true,
        mode: 'live',
        canManage: true,
        portalAvailable: true,
        prices: [
          { tier: 'pro', interval: 'month', formattedAmount: '€39.99', checkoutAvailable: true },
        ],
      },
    }),
  );
  await open(page, 'billing');
  await expect(page.getByRole('heading', { name: 'Votre offre', exact: true })).toBeVisible();
  await expect(page.getByText('Espace local', { exact: true })).toBeVisible();
  await expect(page.locator('.pricing-card')).toHaveCount(0);
  await expect(page.getByText('€39.99', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: en.billing.portal, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Personnaliser mon espace', exact: true }).click();
  await expect(page.locator('.settings-tabs')).toBeVisible();
  expect(purchases).toEqual([]);
});
