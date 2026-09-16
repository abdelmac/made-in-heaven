import 'server-only';
import { z } from 'zod';

export type InvitationEmailStatus =
  'not_requested' | 'not_configured' | 'accepted' | 'failed' | 'unknown';

function configuration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !from || !z.string().email().safeParse(from).success || !appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      return null;
    return { apiKey, from, origin: url.origin };
  } catch {
    return null;
  }
}

export function invitationEmailConfigured() {
  return configuration() !== null;
}

export async function sendInvitationEmail(input: {
  invitationId: string;
  email: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<InvitationEmailStatus> {
  const config = configuration();
  if (!config) return 'not_configured';
  // Never send a request-derived host or a caller-supplied external destination.
  const link = new URL(input.inviteUrl);
  if (link.origin !== config.origin || link.pathname !== '/') return 'failed';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `solace-invitation/${input.invitationId}`,
      },
      body: JSON.stringify({
        from: `Solace <${config.from}>`,
        to: [input.email],
        subject: 'Votre invitation à rejoindre une équipe sur Solace',
        text: [
          `Vous êtes invité·e à rejoindre « ${input.workspaceName} » sur Solace.`,
          '',
          'Connectez-vous avec cette adresse e-mail, puis ouvrez ce lien pour accepter :',
          link.toString(),
          '',
          'Cette invitation expire dans 7 jours et peut être révoquée par l’équipe.',
          'Si vous ne connaissez pas cette équipe, vous pouvez ignorer ce message.',
        ].join('\n'),
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    // 5xx/timeouts can happen after provider acceptance. Do not claim non-delivery.
    if (!response.ok) return response.status >= 500 ? 'unknown' : 'failed';
    const data: unknown = await response.json();
    return z.object({ id: z.string().min(1) }).safeParse(data).success ? 'accepted' : 'unknown';
  } catch {
    // Provider errors may contain secrets or recipient data; never expose them.
    return 'unknown';
  }
}
