import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceData } from '../src/lib/model';

test.skip(
  process.env.PLAYWRIGHT_PWA !== '1',
  'Set PLAYWRIGHT_PWA=1 with a running production server to verify its service worker.',
);

// Run against a production Next.js server. Development deliberately does not
// register the service worker, because development assets change continuously.
async function prepareOffline(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

async function localData(page: Page): Promise<WorkspaceData> {
  return page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local');
    const raw = localStorage.getItem(`folia:v1:local:${workspace}`);
    if (!raw) throw new Error('No local workspace is saved.');
    return JSON.parse(raw).data;
  });
}

test('cached production shell supports offline task editing and persisted timer recovery', async ({
  page,
  context,
}) => {
  await prepareOffline(page);
  await context.setOffline(true);
  await page.goto('/?view=tasks');
  await expect(page.locator('.breadcrumb strong')).toHaveText("Tâches");
  await page.getByRole('button', { name: "Nouvelle tâche", exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel("Titre de la tâche", { exact: true }).fill('Offline research note');
  await dialog.getByRole('button', { name: "Nouvelle tâche", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () =>
      (await localData(page)).tasks.some((task) => task.title === 'Offline research note'),
    )
    .toBe(true);
  const task = (await localData(page)).tasks.find(
    (item) => item.title === 'Offline research note',
  )!;
  await page
    .getByRole('button', { name: 'Start focus: Offline research note', exact: true })
    .click();
  await page.goto('/?view=overview');
  await page.getByRole('button', { name: "Mettre en pause", exact: true }).click();
  await expect(page.getByRole('button', { name: "Reprendre", exact: true })).toBeVisible();
  const paused = (await localData(page)).timer;
  expect(paused.context?.taskId).toBe(task.id);
  expect(paused.status).toBe('paused');

  // A pending account envelope is seeded only to verify cache lifecycle never
  // erases queue storage. This is not an authenticated sync or replay claim.
  const dormantQueue = await page.evaluate(() => {
    const workspace = localStorage.getItem('folia:v1:active-local')!;
    const envelope = JSON.parse(localStorage.getItem(`folia:v1:local:${workspace}`)!);
    envelope.pending = { expectedVersion: 0, createdAt: new Date().toISOString() };
    const key = `folia:v1:account:11111111-1111-4111-8111-111111111111:${workspace}`;
    const raw = JSON.stringify(envelope);
    localStorage.setItem(key, raw);
    return { key, raw };
  });
  await page.reload();
  await expect(page.getByRole('button', { name: "Reprendre", exact: true })).toBeVisible();
  const recovered = await localData(page);
  expect(recovered.timer).toMatchObject({
    sessionId: paused.sessionId,
    remainingMs: paused.remainingMs,
    status: 'paused',
  });
  expect(recovered.tasks.find((item) => item.id === task.id)?.title).toBe('Offline research note');
  expect(recovered.focusSessions).toHaveLength(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), dormantQueue.key)).toBe(
    dormantQueue.raw,
  );
  await page.getByRole('button', { name: "Reprendre", exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: "Mettre en pause", exact: true })).toBeVisible();
  expect((await localData(page)).timer.sessionId).toBe(paused.sessionId);
  expect((await localData(page)).focusSessions).toHaveLength(0);
  await context.setOffline(false);
});

test('service worker excludes privileged requests and clears private caches without deleting productivity storage', async ({
  page,
  context,
}) => {
  await prepareOffline(page);
  const endpoints = ['/api/account', '/api/billing/prices', '/api/workspaces', '/auth/callback'];
  await page.evaluate(async (paths) => {
    await Promise.all(paths.map((path) => fetch(path).catch(() => null)));
  }, endpoints);
  const keys = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    return urls;
  });
  expect(keys.some((url) => new URL(url).pathname === '/')).toBe(true);
  expect(keys.some((url) => new URL(url).pathname.startsWith('/_next/static/'))).toBe(true);
  expect(
    keys.some((url) => /^\/(api|auth|billing|account)(\/|$)/.test(new URL(url).pathname)),
  ).toBe(false);
  // A new online navigation must refresh an older cached shell even when the
  // service-worker script itself has not changed between application builds.
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((value) => value.startsWith('folia-shell-'))!;
    const cache = await caches.open(name);
    const previous = await cache.match('/');
    await cache.put(
      '/',
      new Response(`${await previous!.text()}<!-- folia-stale-build-fixture -->`, {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
  });
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const name = (await caches.keys()).find((value) => value.startsWith('folia-shell-'))!;
        return (await (await (await caches.open(name)).match('/'))!.text()).includes(
          'folia-stale-build-fixture',
        );
      }),
    )
    .toBe(false);
  await context.setOffline(true);
  const networkResults = await page.evaluate(
    async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          try {
            await fetch(path);
            return true;
          } catch {
            return false;
          }
        }),
      ),
    endpoints,
  );
  expect(networkResults).toEqual([false, false, false, false]);
  const before = await localData(page);
  const cacheNames = await page.evaluate(async () => {
    await (
      await caches.open('folia-private-test')
    ).put('/private-test-record', new Response('private fixture'));
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(
        () => reject(new Error('Service worker did not acknowledge cache clearing.')),
        5000,
      );
      channel.port1.onmessage = () => {
        clearTimeout(timeout);
        resolve();
      };
      navigator.serviceWorker.controller!.postMessage({ type: 'CLEAR_PRIVATE_CACHES' }, [
        channel.port2,
      ]);
    });
    return caches.keys();
  });
  expect(cacheNames).not.toContain('folia-private-test');
  expect(cacheNames.some((name) => name.startsWith('folia-shell-'))).toBe(true);
  expect((await localData(page)).workspaceId).toBe(before.workspaceId);
  expect((await localData(page)).tasks).toEqual(before.tasks);
  await context.setOffline(false);
});
