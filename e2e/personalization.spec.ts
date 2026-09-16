import { expect, test, type Page } from '@playwright/test';

async function preferences(page: Page) {
  return page.evaluate(() => {
    const workspaceId = localStorage.getItem('folia:v1:active-local');
    return JSON.parse(localStorage.getItem(`folia:v1:local:${workspaceId}`)!).data.preferences;
  });
}
test('classic colors persist and Pro background previews never silently save', async ({ page }) => {
  await page.goto('/?view=settings');
  await expect(page.locator('.background-presets')).toBeVisible();
  await page.getByRole('button', { name: 'Blurple', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blurple');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blurple');
  await page.getByLabel('Your accent color').fill('#ffff00');
  await page.getByRole('button', { name: 'Save accent color', exact: true }).click();
  await expect.poll(async () => (await preferences(page)).accentColor).toBe('#ffff00');
  expect((await preferences(page)).customTheme).toBeNull();
  await page.getByRole('button', { name: /^Aurora/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'preset');
  expect((await preferences(page)).background.kind).toBe('none');
  await page.getByRole('combobox', { name: 'Density', exact: true }).selectOption('compact');
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'preset');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Tasks/ })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'none');
  await page.goto('/?view=settings');
  await page.getByRole('button', { name: /^Aurora/ }).click();
  await page.getByRole('button', { name: 'Save background', exact: true }).click();
  await expect.poll(async () => (await preferences(page)).background.kind).toBe('preset');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'preset');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    );
  }
});

test('all classic palettes and custom background colors update the complete workspace', async ({
  page,
}) => {
  await page.goto('/?view=settings');
  await expect(page.locator('.background-presets')).toBeVisible();
  for (const mode of ['Light', 'Dark']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    const backgrounds = new Set<string>();
    for (const name of [
      'Garden green',
      'Classic blue',
      'Blurple',
      'Soft plum',
      'Rose',
      'Lagoon',
      'Warm amber',
      'Charcoal',
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      backgrounds.add(
        await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor),
      );
    }
    expect(backgrounds.size).toBe(8);
  }
  await page.getByLabel('Background', { exact: true }).fill('#151524');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 21, 36)');
  expect((await preferences(page)).customTheme).toBeNull();
  await page.getByLabel('Surface', { exact: true }).fill('#252538');
  await page.getByLabel('Text', { exact: true }).fill('#f4f4fa');
  await page.getByRole('combobox', { name: 'Density', exact: true }).selectOption('compact');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 21, 36)');
  await page.getByRole('button', { name: /^Ocean/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'preset');
  await page.getByRole('button', { name: 'Save background', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 21, 36)');
  await page.getByRole('button', { name: 'Save theme', exact: true }).click();
  await expect.poll(async () => (await preferences(page)).customTheme?.background).toBe('#151524');
  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 21, 36)');
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'preset');
  const sidebar = await page
    .locator('.sidebar')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(sidebar).not.toBe('rgb(35, 36, 40)');
  await page.getByRole('button', { name: 'Garden green', exact: true }).click();
  await expect.poll(async () => (await preferences(page)).customTheme).toBeNull();
  await expect(page.locator('body')).not.toHaveCSS('background-color', 'rgb(21, 21, 36)');
});

test('uploaded Pro backgrounds persist, while rejected files preserve the saved image', async ({
  page,
}) => {
  await page.goto('/?view=settings');
  const upload = page.getByLabel('Upload background image');
  await upload.setInputFiles({
    name: 'background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDWQAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('button', { name: 'Use your image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save background', exact: true }).click();
  await expect.poll(async () => (await preferences(page)).background.kind).toBe('image');
  const saved = (await preferences(page)).background;
  expect(saved.image.length).toBeLessThanOrEqual(350000);
  await upload.setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.locator('.error[role="alert"]')).toContainText('Choose a JPG, PNG, or WebP');
  expect((await preferences(page)).background).toEqual(saved);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'image');
  await page.getByRole('button', { name: 'Restore classic background', exact: true }).click();
  await expect.poll(async () => (await preferences(page)).background.kind).toBe('none');
});

test('ending a preview cancels an image upload that is still being prepared', async ({ page }) => {
  await page.goto('/?view=settings');
  await expect(page.locator('.background-presets')).toBeVisible();
  await page.getByRole('button', { name: /^Aurora/ }).click();
  await page.evaluate(() => {
    const original = Image.prototype.decode;
    Image.prototype.decode = async function () {
      await original.call(this);
      await new Promise<void>((resolve) => {
        (window as typeof window & { finishBackgroundDecode?: () => void }).finishBackgroundDecode =
          resolve;
      });
    };
  });
  await page.getByLabel('Upload background image').setInputFiles({
    name: 'pending.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDWQAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.waitForFunction(
    () =>
      typeof (window as typeof window & { finishBackgroundDecode?: () => void })
        .finishBackgroundDecode === 'function',
  );
  await page.getByRole('button', { name: 'End background preview', exact: true }).click();
  await page.evaluate(async () => {
    (window as typeof window & { finishBackgroundDecode?: () => void }).finishBackgroundDecode?.();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'none');
  await expect(page.getByRole('button', { name: 'Use your image', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload background', exact: true })).toBeEnabled();
  expect((await preferences(page)).background.kind).toBe('none');
});
