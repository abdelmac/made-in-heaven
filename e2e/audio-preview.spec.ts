import { expect, test } from '@playwright/test';
import { en } from '../src/lib/i18n/en';

test('ambient preview plays deliberately, survives navigation, pauses for breaks and remembers controls', async ({
  page,
}) => {
  await page.goto('/');
  const player = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Ambiances audio' }) });
  await player.locator('summary').click();
  const audio = player.locator('audio');
  await expect(audio).toHaveJSProperty('paused', true);
  await expect(audio).not.toHaveAttribute('src', /.+/);
  await player.getByRole('button', { name: 'Écouter', exact: true }).click();
  await expect(audio).toHaveJSProperty('paused', false);
  await expect(audio).toHaveAttribute('src', /^blob:/);
  const source = await audio.getAttribute('src');
  await page
    .locator('.main-navigation')
    .getByRole('button', { name: en.navigation.notes, exact: true })
    .click();
  await expect(audio).toHaveAttribute('src', source!);
  await expect(audio).toHaveJSProperty('paused', false);
  await page
    .locator('.main-navigation')
    .getByRole('button', { name: en.navigation.overview, exact: true })
    .click();
  await page.getByRole('button', { name: en.timer.short_break, exact: true }).first().click();
  await expect(audio).toHaveJSProperty('paused', true);
  await expect(player.getByRole('button', { name: 'Écouter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: en.timer.focus, exact: true }).first().click();
  await expect(player.getByRole('button', { name: 'Écouter', exact: true })).toBeEnabled();
  await expect(audio).toHaveJSProperty('paused', true);
  await player.getByRole('combobox', { name: 'Ambiance', exact: true }).selectOption('calm-waves');
  const volume = player.getByRole('slider', { name: 'Volume des ambiances' });
  await volume.focus();
  await volume.press('Home');
  for (let i = 0; i < 6; i++) await volume.press('ArrowRight');
  await expect(volume).toHaveValue('0.3');
  await player.getByLabel('En boucle', { exact: true }).uncheck();
  await page.reload();
  await player.locator('summary').click();
  await expect(player.getByRole('combobox', { name: 'Ambiance', exact: true })).toHaveValue('calm-waves');
  await expect(volume).toHaveValue('0.3');
  await expect(player.getByLabel('En boucle', { exact: true })).not.toBeChecked();
  await expect(audio).toHaveJSProperty('paused', true);
  await expect(audio).not.toHaveAttribute('src', /.+/);
});
