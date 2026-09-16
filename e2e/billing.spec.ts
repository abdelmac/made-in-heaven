import { expect, test } from '@playwright/test';

test('Free colors and notes stay clear, and an unconfigured upgrade leads to account setup', async ({
  page,
}) => {
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({ json: { configured: false, mode: 'test', prices: [] } }),
  );
  await page.goto('/?view=billing');
  const free = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: "Gratuit", exact: true }) });
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await expect(free).toContainText("8 palettes classiques et votre couleur d’accent");
  await expect(free).toContainText("Fiches de notes");
  await expect(pro).toContainText("4 arrière-plans en dégradé et votre propre image");
  await expect(pro).toContainText('Flashcard decks');
  await expect(page.getByText('Payments are not available yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: "Choisir Pro", exact: true })).toHaveCount(0);
  await free.getByRole('button', { name: "Personnaliser vos couleurs" }).click();
  await expect(page.locator('.breadcrumb strong')).toHaveText("Paramètres");
  await page.goto('/?view=billing');
  await pro.getByRole('button', { name: "Se connecter pour changer d’offre" }).click();
  await expect(page.getByRole('dialog', { name: "Votre compte Solace" })).toBeVisible();
});

test('monthly and annual amounts come from the Stripe catalog with explicit annual billing', async ({
  page,
}) => {
  // Synthetic API fixtures verify rendering only; these are not Folia's offered prices.
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({
      json: {
        configured: true,
        mode: 'test',
        prices: [
          {
            tier: 'pro',
            interval: "mois",
            priceId: 'price_fixtureMonth',
            currency: 'eur',
            unitAmount: 1234,
            formattedAmount: '€12.34',
            checkoutAvailable: true,
          },
          {
            tier: 'pro',
            interval: "an",
            priceId: 'price_fixtureYear',
            currency: 'eur',
            unitAmount: 12345,
            formattedAmount: '€123.45',
            checkoutAvailable: true,
          },
        ],
      },
    }),
  );
  await page.goto('/?view=billing');
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await expect(pro).toContainText('€12.34');
  await page.getByRole('button', { name: "Annuel", exact: true }).click();
  await expect(pro).toContainText('€123.45');
  await expect(pro).toContainText('The amount shown covers a full year.');
  await expect(pro).not.toContainText('€12.34');
  await expect(page.getByRole('button', { name: "Annuel", exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(pro.getByRole('button', { name: "Se connecter pour changer d’offre" })).toBeEnabled();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    );
  }
});

test('an unavailable billing API can be retried without showing a checkout success', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/billing/prices', (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 503, json: { error: 'Billing is temporarily unavailable.' } })
      : route.fulfill({ json: { configured: false, mode: 'test', prices: [] } });
  });
  await page.goto('/?view=billing');
  await expect(page.locator('.error[role="alert"]')).toContainText(
    'Billing is temporarily unavailable.',
  );
  await page.getByRole('button', { name: "Vérifier à nouveau la disponibilité", exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toHaveCount(0);
  await expect(page.getByText('Payments are not available yet.', { exact: false })).toBeVisible();
  await expect(
    page.getByText("Votre offre payante est active dans cet espace.", { exact: true }),
  ).toHaveCount(0);
});
