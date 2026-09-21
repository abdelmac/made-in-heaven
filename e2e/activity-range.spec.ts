import { expect, test, type Page } from '@playwright/test';
import {
  createDemoData,
  id,
  LOCAL_USER_ID,
  workspaceDataSchema,
  type TimerPhase,
  type WorkspaceData,
} from '../src/lib/model';
import { storageKey } from '../src/lib/persistence';
import { completeTimer, skipTimer, startTimer } from '../src/lib/timer';

const today = new Date('2027-01-15T12:00:00Z');

function activityFixture() {
  let data = createDemoData(today);
  data.preferences.timeZone = 'UTC';
  data.preferences.weekStartsOn = 1;
  data.plannedSessions = [];
  data.subjects[0].name = 'Range research';
  data.subjects[1].name = 'Other research';
  data.tasks[0].title = 'Leap day research';
  data.tasks[1].title = 'Other subject session';

  const finish = (
    startedAt: string,
    subject: number,
    durationMinutes = 25,
    userId = LOCAL_USER_ID,
    phase: TimerPhase = 'focus',
  ) => {
    const instant = Date.parse(startedAt);
    data = startTimer(
      data,
      { taskId: data.tasks[subject].id, durationMinutes, phase },
      userId,
      instant,
    );
    data = completeTimer(data, instant + durationMinutes * 60000);
  };

  finish('2024-02-28T10:00:00Z', 0);
  finish('2024-02-29T10:00:00Z', 0);
  finish('2024-02-29T11:00:00Z', 1, 40);
  finish('2024-02-29T12:00:00Z', 0, 30, id());
  const skippedAt = Date.parse('2024-02-29T13:00:00Z');
  data = startTimer(data, { taskId: data.tasks[0].id, phase: 'focus' }, LOCAL_USER_ID, skippedAt);
  data = skipTimer(data, skippedAt + 5 * 60000);
  finish('2024-02-29T14:00:00Z', 0, 5, LOCAL_USER_ID, 'shortBreak');
  finish('2024-03-01T10:00:00Z', 0);
  finish('2026-12-31T12:00:00Z', 0);
  finish('2027-01-05T10:00:00Z', 0);
  return workspaceDataSchema.parse(data);
}

async function openFixture(page: Page, view: 'overview' | 'analytics' = 'overview') {
  const data = activityFixture();
  const key = storageKey(data.workspaceId);
  const raw = JSON.stringify({ version: 1, operationId: id(), data });
  await page.clock.setFixedTime(today);
  await page.addInitScript(
    ({ workspaceId, key, raw }) => {
      // Seed only once so navigation and reload cannot hide accidental writes.
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
      localStorage.setItem('folia:v1:active-local', workspaceId);
    },
    { workspaceId: data.workspaceId, key, raw },
  );
  await page.goto(`/?view=${view}`);
  await expect(page.locator('.activity-panel')).toBeVisible({ timeout: 15000 });
  return data;
}

async function persistedActivity(page: Page) {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    const raw = localStorage.getItem(`folia:v1:local:${workspace}`);
    if (!raw) throw new Error('The local activity fixture is missing.');
    const { data } = JSON.parse(raw) as { data: WorkspaceData };
    return { focusSessions: data.focusSessions, preferences: data.preferences };
  });
}

test('month navigation crosses years, includes leap day and preserves saved activity', async ({
  page,
}) => {
  const fixture = await openFixture(page);
  const before = await persistedActivity(page);
  const panel = page.locator('.activity-panel');
  const period = panel.getByRole('group', { name: 'Période d’activité', exact: true });
  const yearOption = period.getByRole('button', { name: '52 semaines', exact: true });
  const monthOption = period.getByRole('button', { name: '1 mois', exact: true });
  await expect(yearOption).toHaveAttribute('aria-pressed', 'true');
  await expect(monthOption).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.locator('.heatmap-cell')).toHaveCount(364);

  await monthOption.click();
  await expect(yearOption).toHaveAttribute('aria-pressed', 'false');
  await expect(monthOption).toHaveAttribute('aria-pressed', 'true');
  const month = panel.getByLabel('Mois d’activité', { exact: true });
  const grid = panel.getByTestId('activity-month');
  await expect(month).toHaveValue('2027-01');
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('button', { name: /^2027-01-\d{2}:/ })).toHaveCount(31);
  await expect(grid.getByRole('button', { name: /^2027-01-15:/ })).toBeEnabled();
  await expect(grid.getByRole('button', { name: /^2027-01-16:.*date future/ })).toBeDisabled();
  expect(await persistedActivity(page)).toEqual(before);

  await panel.getByRole('button', { name: 'Mois précédent', exact: true }).click();
  await expect(month).toHaveValue('2026-12');
  await expect(
    grid.getByRole('button', { name: /^2026-12-31: 1 séances de concentration terminées/ }),
  ).toBeEnabled();
  await panel.getByRole('button', { name: 'Mois suivant', exact: true }).click();
  await expect(month).toHaveValue('2027-01');

  await month.fill('2024-02');
  await expect(grid.getByRole('button', { name: /^2024-02-\d{2}:/ })).toHaveCount(29);
  await expect(
    grid.getByRole('button', {
      name: '2024-02-29: 2 séances de concentration terminées, 65 minutes',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(panel.locator('.heatmap-footer strong').first()).toHaveText('3');
  const viewKey = `folia:v1:activity-view:${LOCAL_USER_ID}:${fixture.workspaceId}`;
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), viewKey))
    .toEqual({ version: 1, view: 'month', month: '2024-02' });
  expect(await persistedActivity(page)).toEqual(before);

  await page
    .locator('.main-navigation')
    .getByRole('button', { name: /^Tâches/ })
    .click();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Tâches');
  await expect(panel).not.toBeVisible();
  await page
    .locator('.main-navigation')
    .getByRole('button', { name: 'Vue d’ensemble', exact: true })
    .click();
  await expect(monthOption).toHaveAttribute('aria-pressed', 'true');
  await expect(yearOption).toHaveAttribute('aria-pressed', 'false');
  await expect(month).toHaveValue('2024-02');
  await expect(grid.getByRole('button', { name: /^2024-02-\d{2}:/ })).toHaveCount(29);
  await expect(panel.locator('.heatmap-footer strong').first()).toHaveText('3');
  expect(await persistedActivity(page)).toEqual(before);
  await page.reload();
  await expect(monthOption).toHaveAttribute('aria-pressed', 'true');
  await expect(yearOption).toHaveAttribute('aria-pressed', 'false');
  await expect(month).toHaveValue('2024-02');
  await expect(grid.getByRole('button', { name: /^2024-02-\d{2}:/ })).toHaveCount(29);
  expect(await persistedActivity(page)).toEqual(before);

  await panel.getByRole('button', { name: 'Ce mois-ci', exact: true }).click();
  await expect(month).toHaveValue('2027-01');
  await yearOption.click();
  await expect(yearOption).toHaveAttribute('aria-pressed', 'true');
  await expect(monthOption).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.locator('.heatmap-cell')).toHaveCount(364);
  expect(await persistedActivity(page)).toEqual(before);
  await page.reload();
  await expect(yearOption).toHaveAttribute('aria-pressed', 'true');
  await expect(monthOption).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.locator('.heatmap-cell')).toHaveCount(364);
  expect(await persistedActivity(page)).toEqual(before);
});

test('activity period switch supports Tab, Enter and Space without changing saved activity', async ({
  page,
}) => {
  await openFixture(page);
  const before = await persistedActivity(page);
  const panel = page.locator('.activity-panel');
  const period = panel.getByRole('group', { name: 'Période d’activité', exact: true });
  const yearOption = period.getByRole('button', { name: '52 semaines', exact: true });
  const monthOption = period.getByRole('button', { name: '1 mois', exact: true });

  await yearOption.focus();
  await page.keyboard.press('Tab');
  await expect(monthOption).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(monthOption).toHaveAttribute('aria-pressed', 'true');
  await expect(yearOption).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.getByTestId('activity-month')).toBeVisible();
  await expect(monthOption).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(yearOption).toBeFocused();
  await page.keyboard.press('Space');
  await expect(yearOption).toHaveAttribute('aria-pressed', 'true');
  await expect(monthOption).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.locator('.heatmap-cell')).toHaveCount(364);
  await expect(yearOption).toBeFocused();
  expect(await persistedActivity(page)).toEqual(before);
});

test('activity controls still change in memory when saving the device view fails', async ({
  page,
}) => {
  const fixture = await openFixture(page);
  const before = await persistedActivity(page);
  const viewKey = `folia:v1:activity-view:${LOCAL_USER_ID}:${fixture.workspaceId}`;
  const savedView = await page.evaluate((key) => localStorage.getItem(key), viewKey);
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('folia:v1:activity-view:'))
        throw new DOMException('Activity view storage is full.', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });

  const panel = page.locator('.activity-panel');
  const period = panel.getByRole('group', { name: 'Période d’activité', exact: true });
  await period.getByRole('button', { name: '1 mois', exact: true }).click();
  const month = panel.getByLabel('Mois d’activité', { exact: true });
  await expect(month).toHaveValue('2027-01');
  await month.fill('2024-02');
  await expect(month).toHaveValue('2024-02');
  await expect(
    panel.getByTestId('activity-month').getByRole('button', { name: /^2024-02-\d{2}:/ }),
  ).toHaveCount(29);
  await panel.getByRole('button', { name: 'Mois précédent', exact: true }).click();
  await expect(month).toHaveValue('2024-01');
  await period.getByRole('button', { name: '52 semaines', exact: true }).click();
  await expect(panel.locator('.heatmap-cell')).toHaveCount(364);
  expect(await page.evaluate((key) => localStorage.getItem(key), viewKey)).toBe(savedView);
  expect(await persistedActivity(page)).toEqual(before);
});

test('month totals and day details share the analytics subject and date filters', async ({
  page,
}) => {
  const fixture = await openFixture(page, 'analytics');
  const before = await persistedActivity(page);
  await page.getByLabel('Du', { exact: true }).fill('2024-02-01');
  await page.getByLabel('Au', { exact: true }).fill('2024-02-29');
  const panel = page.locator('.activity-panel');
  await panel
    .getByRole('group', { name: 'Période d’activité', exact: true })
    .getByRole('button', { name: '1 mois', exact: true })
    .click();
  await panel.getByLabel('Mois d’activité', { exact: true }).fill('2024-02');
  const grid = panel.getByTestId('activity-month');
  await expect(panel.locator('.heatmap-footer strong').first()).toHaveText('3');
  await grid
    .getByRole('button', {
      name: '2024-02-29: 2 séances de concentration terminées, 65 minutes',
      exact: true,
    })
    .click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('.mini-metrics strong')).toHaveText(['2', '1h 5m']);
  await expect(dialog.locator('.session-item')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();

  await page
    .getByRole('combobox', { name: 'Matière des statistiques', exact: true })
    .selectOption(fixture.subjects[0].id);
  await expect(panel.locator('.heatmap-footer strong').first()).toHaveText('2');
  await grid
    .getByRole('button', {
      name: '2024-02-29: 1 séances de concentration terminées, 25 minutes',
      exact: true,
    })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('.mini-metrics strong')).toHaveText(['1', '25m']);
  await expect(dialog.locator('.session-item')).toHaveCount(1);
  await expect(dialog.getByText('Leap day research', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Other subject session', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();

  await page.getByLabel('Du', { exact: true }).fill('2024-02-29');
  await expect(panel.locator('.heatmap-footer strong').first()).toHaveText('1');
  await expect(
    grid.getByRole('button', { name: /^2024-02-29: 1 séances de concentration terminées/ }),
  ).toBeEnabled();
  expect(await persistedActivity(page)).toEqual(before);
});

test('period options and month view fit a 320px viewport and keep day controls usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openFixture(page);
  const panel = page.locator('.activity-panel');
  const period = panel.getByRole('group', { name: 'Période d’activité', exact: true });
  const yearOption = period.getByRole('button', { name: '52 semaines', exact: true });
  const monthOption = period.getByRole('button', { name: '1 mois', exact: true });
  await period.scrollIntoViewIfNeeded();
  await expect(yearOption).toBeVisible();
  await expect(monthOption).toBeVisible();
  await expect(yearOption).toBeInViewport({ ratio: 1 });
  await expect(monthOption).toBeInViewport({ ratio: 1 });
  await monthOption.click();
  await expect(yearOption).toBeInViewport({ ratio: 1 });
  await expect(monthOption).toBeInViewport({ ratio: 1 });
  await expect(panel.getByTestId('activity-month')).toBeVisible();
  await panel.getByRole('button', { name: 'Mois précédent', exact: true }).click();
  await expect(panel.getByLabel('Mois d’activité', { exact: true })).toHaveValue('2026-12');
  await panel.getByRole('button', { name: 'Ce mois-ci', exact: true }).click();
  await expect(panel.getByLabel('Mois d’activité', { exact: true })).toHaveValue('2027-01');
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  await panel
    .getByTestId('activity-month')
    .getByRole('button', {
      name: '2027-01-05: 1 séances de concentration terminées, 25 minutes',
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog').locator('.mini-metrics strong')).toHaveText(['1', '25m']);
});
