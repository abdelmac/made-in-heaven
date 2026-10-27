import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: true,
  readdir: vi.fn(),
  stat: vi.fn(),
  rmdir: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  share: vi.fn(),
  browserOpen: vi.fn(),
}));

vi.mock('@/lib/mobile-platform', () => ({
  isNativeApp: () => mocks.native,
  appApiOrigin: () => 'https://www.solace-pomodoro.com',
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: mocks.browserOpen } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readdir: mocks.readdir,
    stat: mocks.stat,
    rmdir: mocks.rmdir,
    writeFile: mocks.writeFile,
    deleteFile: mocks.deleteFile,
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));

import { exportTextFile, purgeNativeExportCache } from '@/lib/mobile-files';

const now = Date.UTC(2026, 9, 27, 12);
const day = 24 * 60 * 60 * 1000;
const old = '11111111-1111-4111-8111-111111111111';
const recent = '22222222-2222-4222-8222-222222222222';
const changed = '33333333-3333-4333-8333-333333333333';
const noTime = '44444444-4444-4444-8444-444444444444';
const file = '55555555-5555-4555-8555-555555555555';

function directory(name: string, mtime = now - 2 * day) {
  return { name, type: 'directory', mtime, size: 0, uri: `file:///private/cache/exports/${name}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
  mocks.readdir.mockResolvedValue({ files: [] });
  mocks.stat.mockResolvedValue(directory(old));
  mocks.rmdir.mockResolvedValue(undefined);
  mocks.writeFile.mockImplementation(async ({ path }) => ({
    uri: `file:///private/cache/${path}`,
  }));
  mocks.share.mockResolvedValue({ activityType: 'fixture-recipient' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native export handoff', () => {
  it('retains a private cache file after the share sheet hands it to a recipient', async () => {
    await exportTextFile('solace-backup.json', '{"note":"Une idée"}');
    const write = mocks.writeFile.mock.calls[0][0];
    expect(write).toMatchObject({
      directory: 'CACHE',
      data: '{"note":"Une idée"}',
      encoding: 'utf8',
      recursive: true,
    });
    expect(write.path).toMatch(/^exports\/[0-9a-f-]{36}\/solace-backup\.json$/);
    expect(mocks.share).toHaveBeenCalledExactlyOnceWith({
      title: 'solace-backup.json',
      files: [`file:///private/cache/${write.path}`],
      dialogTitle: 'Exporter depuis Solace',
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.rmdir).not.toHaveBeenCalled();
  });

  it('keeps simultaneous exports with the same filename in separate UUID folders', async () => {
    await Promise.all([
      exportTextFile('solace-backup.json', 'first snapshot'),
      exportTextFile('solace-backup.json', 'second snapshot'),
    ]);
    const paths = mocks.writeFile.mock.calls.map(([options]) => options.path);
    expect(new Set(paths).size).toBe(2);
    expect(paths.every((path) => /^exports\/[0-9a-f-]{36}\/solace-backup\.json$/.test(path))).toBe(
      true,
    );
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it('never purges a folder while a share handoff is still active', async () => {
    let ready!: () => void;
    const entered = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let finish!: (value: { activityType: string }) => void;
    const handoff = new Promise<{ activityType: string }>((resolve) => {
      finish = resolve;
    });
    mocks.share.mockImplementation(() => {
      ready();
      return handoff;
    });
    const exporting = exportTextFile('solace-planning.ics', 'BEGIN:VCALENDAR');
    await entered;
    const folder = mocks.writeFile.mock.calls[0][0].path.split('/')[1];
    mocks.readdir.mockResolvedValue({ files: [directory(folder)] });
    mocks.stat.mockResolvedValue(directory(folder));
    await purgeNativeExportCache(now);
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.rmdir).not.toHaveBeenCalled();
    finish({ activityType: 'fixture-recipient' });
    await exporting;
    await purgeNativeExportCache(now);
    expect(mocks.rmdir).toHaveBeenCalledExactlyOnceWith({
      path: `exports/${folder}`,
      directory: 'CACHE',
      recursive: true,
    });
  });

  it('does not turn unavailable cache cleanup into an export failure', async () => {
    mocks.readdir.mockRejectedValue(new Error('No previous export directory'));
    await expect(exportTextFile('solace-backup.json', '{}')).resolves.toBeUndefined();
    expect(mocks.share).toHaveBeenCalledOnce();
  });
});

describe('expired native export cleanup', () => {
  it('purges only old UUID directories under Cache/exports using fresh stat times', async () => {
    mocks.readdir.mockResolvedValue({
      files: [
        directory(old),
        directory(recent),
        directory(changed),
        directory(noTime),
        { ...directory(file), type: 'file' },
        directory('../private-notes'),
        directory(`/absolute/${old}`),
        directory(`${old}/../private-notes`),
        directory('unrelated-plugin'),
        directory(`%2e%2e%2f${old}`),
      ],
    });
    mocks.stat.mockImplementation(async ({ path }) => {
      if (path === `exports/${recent}`) return directory(recent, now - day);
      if (path === `exports/${changed}`) return directory(changed, now - 1000);
      if (path === `exports/${noTime}`) return directory(noTime, Number.NaN);
      return directory(old);
    });
    await purgeNativeExportCache(now);
    expect(mocks.readdir).toHaveBeenCalledExactlyOnceWith({ path: 'exports', directory: 'CACHE' });
    expect(mocks.stat.mock.calls.map(([options]) => options.path)).toEqual([
      `exports/${old}`,
      `exports/${recent}`,
      `exports/${changed}`,
      `exports/${noTime}`,
    ]);
    expect(mocks.rmdir).toHaveBeenCalledExactlyOnceWith({
      path: `exports/${old}`,
      directory: 'CACHE',
      recursive: true,
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it('tolerates missing directories and refuses invalid cleanup timestamps', async () => {
    mocks.readdir.mockRejectedValue(new Error('Directory absent'));
    await expect(purgeNativeExportCache(now)).resolves.toBeUndefined();
    mocks.readdir.mockClear();
    await purgeNativeExportCache(Number.POSITIVE_INFINITY);
    await purgeNativeExportCache(Number.NaN);
    await purgeNativeExportCache(0);
    expect(mocks.readdir).not.toHaveBeenCalled();
    expect(mocks.rmdir).not.toHaveBeenCalled();
  });
});

describe('safe export inputs and web fallback', () => {
  it.each([
    '../notes.json',
    '/notes.json',
    'notes/backup.json',
    'notes\\backup.json',
    '.hidden',
    'a..json',
    '',
  ])('rejects unsafe filenames before touching native files: %s', async (filename) => {
    await expect(exportTextFile(filename, '{}')).rejects.toThrow('nom du fichier');
    expect(mocks.readdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('preserves the browser download and delayed URL revocation without native access', async () => {
    mocks.native = false;
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture-export');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    await exportTextFile('solace-planning.ics', 'BEGIN:VCALENDAR', 'text/calendar;charset=utf-8');
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor).toMatchObject({ href: 'blob:fixture-export', download: 'solace-planning.ics' });
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:fixture-export');
    await purgeNativeExportCache(now);
    expect(mocks.readdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });
});
