import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { appApiOrigin, isNativeApp } from './mobile-platform';

const exportCacheRoot = 'exports';
const exportCacheLifetime = 24 * 60 * 60 * 1000;
const exportDirectoryName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeExports = new Set<string>();

/** Remove only expired export folders owned by Solace, never files in handoff. */
export async function purgeNativeExportCache(now = Date.now()): Promise<void> {
  if (!isNativeApp() || !Number.isFinite(now) || now < exportCacheLifetime) return;
  const listing = await Filesystem.readdir({
    path: exportCacheRoot,
    directory: Directory.Cache,
  }).catch(() => null);
  if (!listing) return; // No previous exports is the normal first-launch case.
  const cutoff = now - exportCacheLifetime;
  for (const entry of listing.files) {
    if (
      entry.type !== 'directory' ||
      !exportDirectoryName.test(entry.name) ||
      activeExports.has(entry.name)
    )
      continue;
    // Construct from an exact UUID rather than trusting a filesystem-returned URI.
    const path = `${exportCacheRoot}/${entry.name}`;
    const info = await Filesystem.stat({ path, directory: Directory.Cache }).catch(() => null);
    if (
      !info ||
      info.type !== 'directory' ||
      !Number.isFinite(info.mtime) ||
      info.mtime <= 0 ||
      info.mtime >= cutoff ||
      activeExports.has(entry.name)
    )
      continue;
    await Filesystem.rmdir({ path, directory: Directory.Cache, recursive: true }).catch(
      () => undefined,
    );
  }
}

export async function exportTextFile(
  filename: string,
  content: string,
  mime = 'application/json',
): Promise<void> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(filename) || filename.includes('..')) {
    throw new Error('Le nom du fichier est invalide.');
  }
  if (isNativeApp()) {
    await purgeNativeExportCache();
    const folder = crypto.randomUUID();
    activeExports.add(folder);
    try {
      const file = await Filesystem.writeFile({
        path: `${exportCacheRoot}/${folder}/${filename}`,
        directory: Directory.Cache,
        data: content,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      await Share.share({
        title: filename,
        files: [file.uri],
        dialogTitle: 'Exporter depuis Solace',
      });
    } finally {
      // Choosing a recipient can resolve the share promise before that app reads
      // its URI. Keep the private cache file until a later TTL cleanup.
      activeExports.delete(folder);
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value, isNativeApp() ? appApiOrigin() : window.location.origin);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Ce lien ne peut pas être ouvert en toute sécurité.');
  }
  if (isNativeApp()) await Browser.open({ url: url.href });
  else window.location.assign(url.href);
}
