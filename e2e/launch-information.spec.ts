import { expect, test } from '@playwright/test';

for (const [route, title] of [
  ['legal', 'Mentions légales'],
  ['privacy', 'Confidentialité'],
  ['terms', 'Conditions'],
  ['support', 'Aide et contact'],
]) {
  test(`${route} is public, readable on mobile and links back to the app`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const response = await page.goto(`/${route}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Retour à l’application', exact: true }),
    ).toHaveAttribute('href', '/?view=overview');
    const navigation = page.getByRole('navigation', { name: 'Informations sur Solace' });
    await expect(navigation.getByRole('link')).toHaveCount(5);
    await expect(
      navigation.getByRole('link', { name: 'Suppression du compte', exact: true }),
    ).toHaveAttribute('href', '/account-deletion');
    if (route === 'privacy') {
      const privacy = page.getByRole('article', { name: 'Données et fonctionnement de Solace' });
      await expect(privacy).toBeVisible();
      await expect(
        privacy.getByRole('link', { name: 'page de suppression du compte', exact: true }),
      ).toHaveAttribute('href', '/account-deletion');
      await expect(
        privacy.getByRole('heading', { name: 'Points à finaliser avant publication', exact: true }),
      ).toBeVisible();
    }
    await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute('href', `/${route}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await page.getByRole('link', { name: 'Retour à l’application', exact: true }).click();
    await expect(page).toHaveURL(/\?view=overview$/);
    await expect(page.locator('.app-shell')).toBeVisible();
  });
}
