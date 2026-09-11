import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://folia.example';
const oldShell = '<html>previous public build</html>';
const newShell =
  '<html>new public build<script src="/_next/static/new-app.js"></script><link href="/_next/static/new-style.css" rel="stylesheet"></html>';
type WorkerEvent = {
  request: { url: string; method: string; mode: string };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
};

function worker(
  options: {
    failedAsset?: boolean;
    failedCacheWrite?: boolean;
    delayedStyle?: Promise<Response>;
  } = {},
) {
  const records = new Map<string, Response>([[`${origin}/`, new Response(oldShell)]]);
  const writes: string[] = [];
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const key = (input: string | Request) =>
    typeof input === 'string' ? new URL(input, origin).href : input.url;
  const cache = {
    async put(input: string | Request, response: Response) {
      if (options.failedCacheWrite && key(input).endsWith('new-style.css'))
        throw new Error('Storage unavailable');
      writes.push(key(input));
      records.set(key(input), response.clone());
    },
    async match(input: string | Request) {
      return records.get(key(input))?.clone();
    },
    async addAll() {},
  };
  const fetch = vi.fn(async (request: Request) => {
    if (request.mode === 'navigate') return new Response('<html>private online response</html>');
    if (request.url === `${origin}/`)
      return new Response(newShell, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (request.url.endsWith('new-style.css') && options.delayedStyle) return options.delayedStyle;
    if (request.url.endsWith('new-style.css') && options.failedAsset)
      return new Response('Unavailable', { status: 503 });
    return new Response('new immutable asset');
  });
  class WorkerRequest extends Request {
    constructor(input: string | URL | Request, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, origin) : input, init);
    }
  }
  runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
        handlers.set(type, handler),
      clients: { claim: async () => undefined },
    },
    caches: { open: async () => cache, match: cache.match, keys: async () => ['folia-shell-v1'] },
    fetch,
    Request: WorkerRequest,
    Response,
    URL,
    Promise,
    Set,
  });
  function navigate() {
    const work: Promise<unknown>[] = [];
    let response!: Promise<Response>;
    handlers.get('fetch')!({
      request: { url: `${origin}/?view=overview`, method: 'GET', mode: 'navigate' },
      waitUntil: (promise) => work.push(promise),
      respondWith: (promise) => {
        response = promise;
      },
    });
    return { response, finished: Promise.all(work) };
  }
  return { navigate, records, writes, fetch };
}

describe('production service-worker updates', () => {
  it('keeps the old shell until new hashed assets are available, then publishes a credentialless public shell', async () => {
    let finishStyle!: (response: Response) => void;
    const delayedStyle = new Promise<Response>((resolve) => {
      finishStyle = resolve;
    });
    const fixture = worker({ delayedStyle });
    const navigation = fixture.navigate();
    expect(await (await navigation.response).text()).toContain('private online response');
    await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledTimes(4));
    expect(await fixture.records.get(`${origin}/`)!.clone().text()).toBe(oldShell);
    finishStyle(new Response('new stylesheet'));
    await navigation.finished;
    expect(await fixture.records.get(`${origin}/`)!.clone().text()).toBe(newShell);
    expect(fixture.writes.at(-1)).toBe(`${origin}/`);
    expect(fixture.records.has(`${origin}/_next/static/new-app.js`)).toBe(true);
    expect(fixture.records.has(`${origin}/_next/static/new-style.css`)).toBe(true);
    const publicRequests = fixture.fetch.mock.calls
      .map(([request]) => request)
      .filter((request) => request.mode !== 'navigate');
    expect(publicRequests.every((request) => request.credentials === 'omit')).toBe(true);
    expect(publicRequests.every((request) => request.cache === 'reload')).toBe(true);
  });
  it.each([{ failedAsset: true }, { failedCacheWrite: true }])(
    'retains usable old shell when an updated asset cannot be staged (%j)',
    async (failure) => {
      const fixture = worker(failure);
      await fixture.navigate().finished;
      expect(await fixture.records.get(`${origin}/`)!.clone().text()).toBe(oldShell);
      expect(fixture.writes).not.toContain(`${origin}/`);
    },
  );
  it('deduplicates simultaneous refreshes and never caches private navigation responses', async () => {
    const fixture = worker();
    await Promise.all([fixture.navigate().finished, fixture.navigate().finished]);
    const publicShellRequests = fixture.fetch.mock.calls.filter(
      ([request]) => request.url === `${origin}/`,
    );
    expect(publicShellRequests).toHaveLength(1);
    expect(await fixture.records.get(`${origin}/`)!.clone().text()).not.toContain(
      'private online response',
    );
  });
});
