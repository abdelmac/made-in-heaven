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
  await page.getByRole('button', { name: 'Preview background', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'preset');
  expect((await preferences(page)).background.kind).toBe('none');
  await page.goto('/?view=tasks');
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
