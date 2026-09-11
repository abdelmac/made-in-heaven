import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('an active timer remains reachable from secondary pages on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'Tasks', exact: true })
    .click();
  await expect(page.locator('.active-timer-dock')).toBeVisible();
  await page.locator('.active-timer-dock').click();
  const dialog = page.getByRole('dialog', { name: 'Time to focus', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.active-timer-dock')).toBeFocused();
});

test('light, dark, mobile, and task dialogs meet automated accessibility checks', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 });
  for (const appearance of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== appearance) {
      await page.getByRole('button', { name: 'Toggle light and dark appearance' }).click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
      })),
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    mobile.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((n) => n.html) })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toBeVisible();
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    dialog.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((n) => n.html) })),
  ).toEqual([]);
});
