import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceData } from '../src/lib/model';

async function open(page: Page, view: string) {
  await page.goto(`/?view=${view}`);
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.breadcrumb strong')).toHaveText(
    view[0].toUpperCase() + view.slice(1),
  );
}
async function data(page: Page): Promise<WorkspaceData> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem(`folia:v1:local:${localStorage.getItem('folia:v1:active-local')}`)!,
      ).data,
  );
}
async function createDeck(page: Page) {
  await open(page, 'flashcards');
  await page.getByRole('button', { name: 'New deck', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New deck', exact: true });
  await dialog.getByRole('textbox', { name: 'Deck title', exact: true }).fill('Biology essentials');
  await dialog
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A few ideas worth remembering.');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Biology essentials', exact: true }).click();
}

test('free subject notes retain revisions and subject completion notes preserve focus totals', async ({
  page,
}) => {
  await open(page, 'notes');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'New note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Note title', exact: true })
    .fill('A useful design principle');
  await dialog
    .getByRole('combobox', { name: 'Subject', exact: true })
    .selectOption({ label: 'Product design' });
  await dialog
    .getByRole('textbox', { name: 'Note content (Markdown supported)', exact: true })
    .fill('## First idea\n\nKeep the main action clear.');
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'A useful design principle', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'A useful design principle', exact: true });
  await expect(dialog.getByRole('heading', { name: 'First idea', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit note', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Note content (Markdown supported)', exact: true })
    .fill('## Refined idea\n\nKeep the main action clear and reachable.');
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await data(page)).noteSheets[0].revisions).toHaveLength(1);
  await open(page, 'subjects');
  await page.getByRole('button', { name: 'Product design', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Product design', exact: true });
  await dialog.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'A useful design principle', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Complete subject', exact: true }).click();
  const completion = page.getByRole('dialog', {
    name: 'Celebrate a completed subject',
    exact: true,
  });
  await completion
    .getByRole('textbox', { name: 'Completion summary (optional)', exact: true })
    .fill('I can explain and apply the main principles.');
  await completion.getByRole('button', { name: 'Complete subject', exact: true }).click();
  await expect(completion).not.toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Completed: Product design', exact: true }),
  ).toBeVisible();
  const completed = await data(page);
  expect(
    completed.subjects.find((subject) => subject.name === 'Product design')?.completedAt,
  ).toBeTruthy();
  expect(completed.focusSessions).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Reopen subject', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Complete subject', exact: true })).toBeVisible();
  expect((await data(page)).noteSheets.some((note) => note.kind === 'subject_completion')).toBe(
    true,
  );
  await dialog.getByRole('button', { name: 'A useful design principle', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'A useful design principle', exact: true });
  await note.getByRole('button', { name: 'Delete note', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete note', exact: true });
  await deletion.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(deletion).not.toBeVisible();
  expect((await data(page)).noteSheets.map((item) => item.kind)).toEqual(['subject_completion']);
});

test('a completed focus can produce a subject-linked reflection without a task', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-14T08:00:00Z') });
  await open(page, 'settings');
  await page.locator('.settings-tabs').getByRole('button', { name: 'Timer', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Focus (minutes)', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await open(page, 'subjects');
  const subjectCard = page
    .locator('.subject-card')
    .filter({ has: page.getByRole('button', { name: 'Product design', exact: true }) });
  await subjectCard.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.clock.fastForward(61_000);
  await expect
    .poll(
      async () =>
        (await data(page)).focusSessions.filter((session) => session.status === 'completed').length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Product design', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Product design', exact: true });
  await dialog.getByRole('button', { name: 'Notes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reflect on latest session', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'New note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Note content (Markdown supported)', exact: true })
    .fill('A clear hierarchy helps me decide what to do next.');
  await dialog.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await data(page);
  expect(saved.noteSheets[0]).toMatchObject({
    kind: 'session_reflection',
    sessionId: saved.focusSessions[0].id,
    subjectId: saved.focusSessions[0].context.subjectId,
  });
  expect(saved.focusSessions).toHaveLength(1);
});

test('local flashcards support CRUD, keyboard practice, repeat cards, and export without focus credit', async ({
  page,
}) => {
  await createDeck(page);
  let deck = page.getByRole('dialog', { name: 'Biology essentials', exact: true });
  for (const [front, back] of [
    ['What makes ATP?', 'Mitochondria'],
    ['What stores DNA?', 'The nucleus'],
  ]) {
    await deck.getByRole('button', { name: 'New card', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New card', exact: true });
    await editor.getByRole('textbox', { name: 'Question', exact: true }).fill(front);
    await editor.getByRole('textbox', { name: 'Answer', exact: true }).fill(back);
    await editor.getByRole('button', { name: 'Save card', exact: true }).click();
    await expect(editor).not.toBeVisible();
  }
  await deck.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Biology essentials', exact: true }).click();
  deck = page.getByRole('dialog', { name: 'Biology essentials', exact: true });
  await deck.getByRole('button', { name: 'Edit card', exact: true }).first().click();
  let editor = page.getByRole('dialog', { name: 'Edit card', exact: true });
  await editor
    .getByRole('textbox', { name: 'Answer', exact: true })
    .fill('Mitochondria produce most cellular ATP.');
  await editor.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await deck.getByRole('button', { name: 'Study deck', exact: true }).click();
  const study = page.getByRole('dialog', { name: 'Study deck: Biology essentials', exact: true });
  await expect(study.getByRole('button', { name: 'Known', exact: true })).toBeDisabled();
  const card = study.getByRole('button', { name: /Question: What makes ATP/ });
  await card.focus();
  await page.keyboard.press('Space');
  await expect(study.getByRole('button', { name: /Answer: Mitochondria produce/ })).toBeVisible();
  await page.keyboard.press('1');
  await expect(study.getByRole('button', { name: /Question: What stores DNA/ })).toBeVisible();
  await study.getByRole('button', { name: 'Show answer', exact: true }).click();
  await page.keyboard.press('2');
  await expect(
    study.getByRole('heading', { name: 'A little more remembered.', exact: true }),
  ).toBeVisible();
  await study.getByRole('button', { name: 'Practice Again cards', exact: true }).click();
  await expect(study.getByText('1 / 1', { exact: true })).toBeVisible();
  await study.getByRole('button', { name: 'Show answer', exact: true }).click();
  await study.getByRole('button', { name: 'Known', exact: true }).click();
  await study.getByRole('button', { name: 'Finish study', exact: true }).click();
  await expect(study).not.toBeVisible();
  // Inspect the exact browser-generated payload as well as the real download.
  // Edge can lock its temporary files against Node reads on managed Windows.
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = (value) => {
      if (value instanceof Blob && value.type === 'application/json') {
        (window as Window & { foliaExportPayload?: Promise<string> }).foliaExportPayload =
          value.text();
        URL.createObjectURL = original;
      }
      return original.call(URL, value);
    };
  });
  const download = page.waitForEvent('download');
  await deck.getByRole('button', { name: 'Export deck', exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('folia-flashcards.json');
  expect(await exported.failure()).toBeNull();
  const exportedData = JSON.parse(
    (await page.evaluate(
      async () => (window as Window & { foliaExportPayload?: Promise<string> }).foliaExportPayload,
    )) || 'null',
  );
  expect(exportedData.cards.map((item: { back: string }) => item.back)).toEqual([
    'Mitochondria produce most cellular ATP.',
    'The nucleus',
  ]);
  expect((await data(page)).focusSessions).toHaveLength(0);
  await deck.getByRole('button', { name: 'Delete card', exact: true }).last().click();
  editor = page.getByRole('dialog', { name: 'Delete card', exact: true });
  await editor.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect((await data(page)).flashcards).toHaveLength(1);
  await deck.getByRole('button', { name: 'Delete deck', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete deck', exact: true });
  await deletion.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(deletion).not.toBeVisible();
  expect((await data(page)).flashcardDecks).toHaveLength(0);
  expect((await data(page)).flashcards).toHaveLength(0);
});

test('notes and flashcards fit a 320px screen and keep visible preview access labels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const view of ['notes', 'flashcards']) {
    await open(page, view);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  }
  await expect(
    page.getByText(
      'Local preview: explore flashcards on this device. Cloud flashcards require Pro or Team.',
      { exact: true },
    ),
  ).toBeVisible();
  await createDeck(page);
  const deck = page.getByRole('dialog', { name: 'Biology essentials', exact: true });
  await expect(deck).toBeVisible();
  const bounds = await deck.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
});
