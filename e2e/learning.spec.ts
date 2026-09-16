import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceData } from '../src/lib/model';
import { en, type View } from '../src/lib/i18n/en';

async function open(page: Page, view: View) {
  await page.goto(`/?view=${view}`);
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.breadcrumb strong')).toHaveText(en.navigation[view]);
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
  await page.getByRole('button', { name: 'Nouveau paquet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau paquet', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Titre du paquet', exact: true })
    .fill('Biology essentials');
  await dialog
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A few ideas worth remembering.');
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Biology essentials', exact: true }).click();
}

test('free subject notes retain revisions and subject completion notes preserve focus totals', async ({
  page,
}) => {
  await open(page, 'notes');
  await page.getByRole('button', { name: 'Nouvelle note', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nouvelle note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Titre de la note', exact: true })
    .fill('A useful design principle');
  await dialog
    .getByRole('combobox', { name: 'Matière', exact: true })
    .selectOption({ label: 'Design produit' });
  await dialog
    .getByRole('textbox', { name: 'Contenu de la note (Markdown accepté)', exact: true })
    .fill('## First idea\n\nKeep the main action clear.');
  await dialog.getByRole('button', { name: 'Enregistrer la note', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'A useful design principle', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'A useful design principle', exact: true });
  await expect(dialog.getByRole('heading', { name: 'First idea', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Modifier la note', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Modifier la note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Contenu de la note (Markdown accepté)', exact: true })
    .fill('## Refined idea\n\nKeep the main action clear and reachable.');
  await dialog.getByRole('button', { name: 'Enregistrer la note', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await data(page)).noteSheets[0].revisions).toHaveLength(1);
  await open(page, 'subjects');
  await page.getByRole('button', { name: 'Design produit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Design produit', exact: true });
  await dialog.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'A useful design principle', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Terminer la matière', exact: true }).click();
  const completion = page.getByRole('dialog', {
    name: 'Célébrez une matière terminée',
    exact: true,
  });
  await completion
    .getByRole('textbox', { name: 'Bilan final (facultatif)', exact: true })
    .fill('I can explain and apply the main principles.');
  await completion.getByRole('button', { name: 'Terminer la matière', exact: true }).click();
  await expect(completion).not.toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Bilan : Design produit', exact: true }),
  ).toBeVisible();
  const completed = await data(page);
  expect(
    completed.subjects.find((subject) => subject.name === 'Design produit')?.completedAt,
  ).toBeTruthy();
  expect(completed.focusSessions).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Rouvrir la matière', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Terminer la matière', exact: true }),
  ).toBeVisible();
  expect((await data(page)).noteSheets.some((note) => note.kind === 'subject_completion')).toBe(
    true,
  );
  await dialog.getByRole('button', { name: 'A useful design principle', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'A useful design principle', exact: true });
  await note.getByRole('button', { name: 'Supprimer la note', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Supprimer la note', exact: true });
  await deletion.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(deletion).not.toBeVisible();
  expect((await data(page)).noteSheets.map((item) => item.kind)).toEqual(['subject_completion']);
});

test('a completed focus can produce a subject-linked reflection without a task', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-14T08:00:00Z') });
  await open(page, 'settings');
  await page
    .locator('.settings-tabs')
    .getByRole('button', { name: 'Minuteur', exact: true })
    .click();
  await page.getByRole('spinbutton', { name: 'Concentration (minutes)', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await open(page, 'subjects');
  const subjectCard = page
    .locator('.subject-card')
    .filter({ has: page.getByRole('button', { name: 'Design produit', exact: true }) });
  await subjectCard.getByRole('button', { name: 'Concentration', exact: true }).click();
  await page.clock.fastForward(61_000);
  await expect
    .poll(
      async () =>
        (await data(page)).focusSessions.filter((session) => session.status === 'completed').length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Design produit', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Design produit', exact: true });
  await dialog.getByRole('button', { name: 'Notes', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Faire le point sur la dernière séance', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Nouvelle note', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Contenu de la note (Markdown accepté)', exact: true })
    .fill('A clear hierarchy helps me decide what to do next.');
  await dialog.getByRole('button', { name: 'Enregistrer la note', exact: true }).click();
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
    await deck.getByRole('button', { name: 'Nouvelle carte', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Nouvelle carte', exact: true });
    await editor.getByRole('textbox', { name: 'Question', exact: true }).fill(front);
    await editor.getByRole('textbox', { name: 'Réponse', exact: true }).fill(back);
    await editor.getByRole('button', { name: 'Enregistrer la carte', exact: true }).click();
    await expect(editor).not.toBeVisible();
  }
  await deck.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Biology essentials', exact: true }).click();
  deck = page.getByRole('dialog', { name: 'Biology essentials', exact: true });
  await deck.getByRole('button', { name: 'Modifier la carte', exact: true }).first().click();
  let editor = page.getByRole('dialog', { name: 'Modifier la carte', exact: true });
  await editor
    .getByRole('textbox', { name: 'Réponse', exact: true })
    .fill('Mitochondria produce most cellular ATP.');
  await editor.getByRole('button', { name: 'Enregistrer la carte', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await deck.getByRole('button', { name: 'Réviser le paquet', exact: true }).click();
  const study = page.getByRole('dialog', {
    name: 'Réviser le paquet: Biology essentials',
    exact: true,
  });
  await expect(study.getByRole('button', { name: 'Acquise', exact: true })).toBeDisabled();
  const card = study.getByRole('button', { name: /Question: What makes ATP/ });
  await card.focus();
  await page.keyboard.press('Space');
  await expect(study.getByRole('button', { name: /Réponse: Mitochondria produce/ })).toBeVisible();
  await page.keyboard.press('1');
  await expect(study.getByRole('button', { name: /Question: What stores DNA/ })).toBeVisible();
  await study.getByRole('button', { name: 'Afficher la réponse', exact: true }).click();
  await page.keyboard.press('2');
  await expect(
    study.getByRole('heading', { name: 'Un peu plus en mémoire.', exact: true }),
  ).toBeVisible();
  await study.getByRole('button', { name: 'Réviser les cartes à revoir', exact: true }).click();
  await expect(study.getByText('1 / 1', { exact: true })).toBeVisible();
  await study.getByRole('button', { name: 'Afficher la réponse', exact: true }).click();
  await study.getByRole('button', { name: 'Acquise', exact: true }).click();
  await study.getByRole('button', { name: 'Terminer la révision', exact: true }).click();
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
  await deck.getByRole('button', { name: 'Exporter le paquet', exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('solace-cartes-memoire.json');
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
  await deck.getByRole('button', { name: 'Supprimer la carte', exact: true }).last().click();
  editor = page.getByRole('dialog', { name: 'Supprimer la carte', exact: true });
  await editor.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect((await data(page)).flashcards).toHaveLength(1);
  await deck.getByRole('button', { name: 'Supprimer le paquet', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Supprimer le paquet', exact: true });
  await deletion.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(deletion).not.toBeVisible();
  expect((await data(page)).flashcardDecks).toHaveLength(0);
  expect((await data(page)).flashcards).toHaveLength(0);
});

test('notes and flashcards fit a 320px screen and keep visible preview access labels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const view of ['notes', 'flashcards'] as const) {
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
      'Aperçu local : découvrez les cartes mémoire sur cet appareil. Leur synchronisation nécessite Pro ou Team.',
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
