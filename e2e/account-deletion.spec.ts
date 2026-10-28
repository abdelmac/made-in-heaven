import { expect, test } from '@playwright/test';

test('account deletion instructions and browser action are public without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 },
  });
  const page = await context.newPage();
  const response = await page.goto('/account-deletion');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Supprimer votre compte Solace' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ouvrir la suppression du compte', exact: true }),
  ).toHaveAttribute('href', '/?account=delete');
  await expect(
    page.getByRole('heading', { name: 'Données supprimées', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Données qui peuvent rester', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Informations sur Solace' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await context.close();
});

test('the deletion action opens account settings in the browser', async ({ page }) => {
  const deletionRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && new URL(request.url()).pathname === '/api/account') {
      deletionRequests.push(request.url());
    }
  });
  await page.goto('/account-deletion');
  await page.getByRole('link', { name: 'Ouvrir la suppression du compte', exact: true }).click();
  await expect(page).toHaveURL(/\?view=overview$/);
  await expect(page.locator('.app-shell')).toBeVisible();
  const account = page.getByRole('dialog', { name: 'Votre compte Solace', exact: true });
  await expect(account).toBeVisible();
  await expect(account.getByRole('status')).toContainText(
    'Connectez-vous au compte Solace à supprimer',
  );
  await expect(
    account.getByRole('button', { name: 'Se connecter', exact: true }).first(),
  ).toBeVisible();
  await expect(
    account.getByRole('button', { name: 'Supprimer le compte', exact: true }),
  ).toHaveCount(0);
  expect(deletionRequests).toEqual([]);
});
