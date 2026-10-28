import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateGooglePush } from '@/lib/billing/native-google';
import { googleConfig } from '@/lib/billing/native-config';
import { reconcileNativeNotification } from '@/lib/billing/native-server';
import { handleApiError, HttpError, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const notificationSchema = z.object({
  packageName: z.string(),
  version: z.literal('1.0'),
  subscriptionNotification: z
    .object({ purchaseToken: z.string().min(10).max(8192), notificationType: z.number().int() })
    .optional(),
  voidedPurchaseNotification: z
    .object({
      purchaseToken: z.string().min(10).max(8192),
      orderId: z.string().min(1).max(200),
      productType: z.number().int(),
      refundType: z.number().int(),
    })
    .optional(),
  testNotification: z.object({ version: z.string() }).optional(),
});
export async function POST(request: Request) {
  try {
    await authenticateGooglePush(request);
    const envelope = z
      .object({
        message: z.object({ data: z.string().max(120_000), messageId: z.string().min(1).max(200) }),
        subscription: z.string().max(1000).optional(),
      })
      .parse(await readJson(request, 125_000));
    let raw;
    try {
      raw = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'));
    } catch {
      throw new HttpError(400, 'Google Play notification contains invalid data.');
    }
    const notification = notificationSchema.parse(raw);
    if (notification.packageName !== googleConfig().packageName)
      throw new HttpError(400, 'Google Play notification belongs to another app.');
    if (
      [
        notification.testNotification,
        notification.subscriptionNotification,
        notification.voidedPurchaseNotification,
      ].filter(Boolean).length !== 1
    )
      throw new HttpError(400, 'Google Play notification must contain one event.');
    if (notification.testNotification) return NextResponse.json({ received: true });
    const voided = notification.voidedPurchaseNotification;
    const token = notification.subscriptionNotification?.purchaseToken ?? voided?.purchaseToken;
    if (!token || (voided && (voided.productType !== 1 || voided.refundType !== 1)))
      throw new HttpError(400, 'Google Play notification type is unsupported.');
    // All lifecycle events re-query subscriptionsv2; a trusted full-void event
    // additionally removes access even if the API has not reflected the refund.
    await reconcileNativeNotification('google', token, undefined, voided?.orderId);
    return NextResponse.json({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}
