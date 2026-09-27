import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('home explains Solace and opens the workspace without creating workspace data first', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Un peu de calme.Un pas de plus.',
  );
  await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeEnabled();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('folia:v1:')),
    ),
  ).toEqual([]);
  await page.getByRole('link', { name: 'Comment ça marche', exact: true }).click();
  await expect(page.locator('#comment-ca-marche')).toBeInViewport();
  await page.getByText('Est-ce que je dois créer un compte ?', { exact: true }).click();
  await expect(
    page.getByText('Vous pouvez essayer le minuteur et utiliser un espace local', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir mon espace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page).toHaveURL(/\?view=overview$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Un peu de calme.Un pas de plus.',
  );
  await page.goForward();
  await expect(page.locator('.app-shell')).toBeVisible();
});

test('practice timer pauses, restores on reload, completes and starts a break only on request', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText('25:00');
  await page.getByRole('button', { name: 'Commencer', exact: true }).click();
  await page.clock.fastForward(65_000);
  await page.getByRole('button', { name: 'Mettre en pause', exact: true }).click();
  const paused = await timer.innerText();
  expect(paused).toMatch(/^23:5[45]$/);
  await page.clock.fastForward(60_000);
  await expect(timer).toHaveText(paused);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reprendre', exact: true })).toBeVisible();
  await expect(timer).toHaveText(paused);
  await page.getByRole('button', { name: 'Reprendre', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible();
  await page.clock.fastForward(25 * 60_000);
  await expect(timer).toHaveText('00:00');
  await expect(page.getByRole('status')).toContainText('Prenez cinq minutes');
  await page.clock.fastForward(60_000);
  await expect(timer).toHaveText('00:00');
  await page.getByRole('button', { name: 'Prendre une pause', exact: true }).click();
  await expect(timer).toHaveText('05:00');
  await page.getByRole('button', { name: 'Réinitialiser le minuteur', exact: true }).click();
  await expect(timer).toHaveText('05:00');
  await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Concentration 25 min', exact: true }).click();
  await expect(timer).toHaveText('25:00');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('folia:v1:')),
    ),
  ).toEqual([]);
});

test('visiting home and trying its timer preserves an active workspace session', async ({
  page,
}) => {
  await page.goto('/?view=overview');
  await page.getByRole('button', { name: 'Commencer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible();
  const before = await page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
  await page.locator('.sidebar').getByRole('link', { name: 'Solace — page d’accueil' }).click();
  await page.getByRole('button', { name: 'Commencer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir mon espace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible();
  const after = await page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!).data;
  });
  expect(after.timer.sessionId).toBe(before.timer.sessionId);
  expect(before.timer.endAt).toBeTruthy();
  expect(after.timer.endAt).toBe(before.timer.endAt);
  expect(after.focusSessions).toEqual(before.focusSessions);
});

test('home is readable on mobile and accessible in light and dark themes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('link', { name: 'Ouvrir mon espace', exact: true })).toBeVisible();
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `.local/previews/home-${width}.png`, fullPage: true });
    }
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((node) => ({ html: node.html, summary: node.failureSummary })),
      })),
    ).toEqual([]);
  }
});

test('practice timer still works if browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Storage blocked');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mettre en pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reprendre', exact: true })).toBeVisible();
});

test('home explanations are present in the public HTML without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Un peu de calme.Un pas de plus.',
  );
  await expect(page.getByRole('heading', { name: 'Choisissez une seule chose.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ouvrir mon espace', exact: true })).toHaveAttribute(
    'href',
    '/?view=overview',
  );
  await context.close();
});
