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
    .filter({ has: page.getByRole('heading', { name: 'Free', exact: true }) });
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await expect(free).toContainText('8 classic color palettes + your own accent color');
  await expect(free).toContainText('Note sheets');
  await expect(pro).toContainText('4 gradient backgrounds + your own image');
  await expect(pro).toContainText('Flashcard decks');
  await expect(page.getByText('Payments are not available yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get Pro', exact: true })).toHaveCount(0);
  await free.getByRole('button', { name: 'Personalize your colors' }).click();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Settings');
  await page.goto('/?view=billing');
  await pro.getByRole('button', { name: 'Sign in to upgrade' }).click();
  await expect(page.getByRole('dialog', { name: 'Your Folia account' })).toBeVisible();
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
            interval: 'month',
            priceId: 'price_fixtureMonth',
            currency: 'eur',
            unitAmount: 1234,
            formattedAmount: '€12.34',
            checkoutAvailable: true,
          },
          {
            tier: 'pro',
            interval: 'year',
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
  await page.getByRole('button', { name: 'Annually', exact: true }).click();
  await expect(pro).toContainText('€123.45');
  await expect(pro).toContainText('The amount shown covers a full year.');
  await expect(pro).not.toContainText('€12.34');
  await expect(page.getByRole('button', { name: 'Annually', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(pro.getByRole('button', { name: 'Sign in to upgrade' })).toBeEnabled();
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
  await page.getByRole('button', { name: 'Check availability again', exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toHaveCount(0);
  await expect(page.getByText('Payments are not available yet.', { exact: false })).toBeVisible();
  await expect(
    page.getByText('Your paid plan is active for this workspace.', { exact: true }),
  ).toHaveCount(0);
});
