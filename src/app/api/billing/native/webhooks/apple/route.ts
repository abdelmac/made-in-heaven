import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, HttpError, readJson } from '@/lib/server/http';
import { appleServices, validateAppleTransaction } from '@/lib/billing/native-apple';
import { reconcileNativeNotification } from '@/lib/billing/native-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const { signedPayload } = z
      .object({ signedPayload: z.string().min(20).max(100_000) })
      .strict()
      .parse(await readJson(request, 105_000));
    const { verifier, config } = appleServices();
    let notification;
    try {
      notification = await verifier.verifyAndDecodeNotification(signedPayload);
    } catch {
      throw new HttpError(400, 'Apple notification signature is invalid.');
    }
    if (notification.version !== '2.0' || !notification.notificationUUID)
      throw new HttpError(400, 'Apple notification version is unsupported.');
    if (notification.notificationType === 'TEST') return NextResponse.json({ received: true });
    if (!notification.data?.signedTransactionInfo)
      throw new HttpError(400, 'Apple notification has no signed purchase.');
    let transaction;
    try {
      transaction = validateAppleTransaction(
        await verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo),
        config,
      );
    } catch {
      throw new HttpError(400, 'Apple notification purchase is invalid.');
    }
    if (notification.notificationType === 'REFUND_REVERSED') {
      await reconcileNativeNotification(
        'apple',
        transaction.originalTransactionId!,
        transaction.appAccountToken!,
        undefined,
        transaction.transactionId!,
      );
    } else if (
      notification.notificationType === 'REFUND' ||
      transaction.revocationDate !== undefined
    ) {
      await reconcileNativeNotification(
        'apple',
        transaction.originalTransactionId!,
        transaction.appAccountToken!,
        transaction.transactionId!,
      );
    } else {
      await reconcileNativeNotification(
        'apple',
        transaction.originalTransactionId!,
        transaction.appAccountToken!,
      );
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}
