import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { localizeError } from '@/lib/i18n/errors';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  if (request.headers.get('origin') !== expected)
    throw new HttpError(403, 'This request must come from Folia.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new HttpError(403, 'Cross-site requests are not allowed.');
}

export async function readJson(request: Request, maxBytes = 2_000_000): Promise<unknown> {
  if (!(request.headers.get('content-type') || '').includes('application/json'))
    throw new HttpError(415, 'Send a JSON request.');
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new HttpError(413, 'This workspace is too large to save.');
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new HttpError(413, 'This workspace is too large to save.');
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'The request contains invalid JSON.');
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json({ error: localizeError(error.message) }, { status: error.status });
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: 'Vérifiez les informations saisies.',
        issues: error.issues.map((issue) => ({
          path: issue.path,
          message: localizeError(issue.message),
        })),
      },
      { status: 400 },
    );
  return NextResponse.json(
    { error: 'Solace n’a pas pu terminer cette opération. Réessayez.' },
    { status: 500 },
  );
}

export function databaseError(error: { code?: string; message?: string }) {
  const message = error.message || 'The database rejected this operation.';
  if (error.code === '23P01')
    return new HttpError(
      409,
      message.includes('focus_sessions')
        ? 'This completion overlaps with another focus session on your account. Review the conflicting offline sessions before saving.'
        : 'This planned time overlaps with another session on your account, possibly in another workspace.',
    );
  if (error.code === '23505' || error.code === '40001') return new HttpError(409, message);
  if (error.code === '42501') return new HttpError(403, message);
  if (error.code === '22023' || error.code === '23514') return new HttpError(400, message);
  return new HttpError(
    503,
    'Cloud storage is not ready. Check the database configuration and migrations.',
  );
}
