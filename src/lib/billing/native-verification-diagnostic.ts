import 'server-only';
import { ZodError } from 'zod';
import { HttpError } from '@/lib/server/http';

type NativeVerificationErrorCode =
  | 'environment_mismatch'
  | 'invalid_subscription'
  | 'product_mismatch'
  | 'unsupported_state'
  | 'invalid_expiry'
  | 'invalid_request'
  | 'verification_failed';

/** Only fixed categories may leave verification; receipt and error details stay private. */
export function nativeVerificationDiagnostic(error: unknown, status: number) {
  let code: NativeVerificationErrorCode = 'verification_failed';
  if (error instanceof ZodError) {
    code = 'invalid_request';
  } else if (error instanceof HttpError && error.status === 400) {
    switch (error.message) {
      case 'This Google Play purchase belongs to another environment.':
        code = 'environment_mismatch';
        break;
      case 'Google Play returned an invalid subscription.':
        code = 'invalid_subscription';
        break;
      case 'This Google Play product or base plan is not configured.':
        code = 'product_mismatch';
        break;
      case 'Google Play subscription state is unsupported.':
        code = 'unsupported_state';
        break;
      case 'Google Play subscription expiry is invalid.':
        code = 'invalid_expiry';
        break;
    }
  }
  return { event: 'native_purchase_verification_failed', code, status };
}
