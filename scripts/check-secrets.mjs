import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// High-confidence Stripe credential patterns only; this is not a full secret scanner.
export function containsStripeCredential(text) {
  return (
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{40,}\b/.test(text) ||
    /\bwhsec_[A-Za-z0-9]{32,}\b/.test(text)
  );
}

export function assertNoCommittedStripeCredentials(directory = process.cwd()) {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
    .split('\0')
    .filter(Boolean);
  const unsafe = [];
  for (const file of new Set(files)) {
    try {
      if (containsStripeCredential(readFileSync(resolve(directory, file), 'utf8')))
        unsafe.push(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Secret scan could not read a project file.');
    }
  }
  if (unsafe.length)
    throw new Error(
      `Stripe credential detected in project files: ${unsafe.join(', ')}. Rotate it; do not publish it.`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assertNoCommittedStripeCredentials();
    console.log(
      'No Stripe credential detected in tracked/non-ignored project files. Git history was not scanned.',
    );
  } catch (error) {
    console.error(
      error instanceof Error &&
        error.message.startsWith('Stripe credential detected in project files:')
        ? error.message
        : 'Secret scan failed. No credential values were printed.',
    );
    process.exitCode = 1;
  }
}
