import {
  ApiError,
  RateLimitError,
  jsonError,
  verifyCsrf,
} from './server/api';
import { AuthError } from './server/auth';
import { OtpDeliveryError } from './server/email';
import { BusinessError } from './validation';

// Older banking code passes status first, then the message.
export class HttpError extends ApiError {
  constructor(status: number, message: string) {
    super(message, status);
    this.name = 'HttpError';
  }
}

// Check the request origin and read a JSON object.
export async function readBody(
  request: Request
): Promise<Record<string, unknown>> {
  verifyCsrf(request);

  const text = await request.text();

  if (new TextEncoder().encode(text).length > 32_000) {
    throw new HttpError(413, 'The request is too large.');
  }

  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Send a valid JSON request.');
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'A request object is required.');
  }

  return data as Record<string, unknown>;
}

// Reuse the existing error formatter and preserve business-error statuses.
export function errorResponse(error: unknown) {
  if (error instanceof BusinessError) {
    return jsonError(
      new ApiError(error.message, error.status, 'BUSINESS_ERROR')
    );
  }

  if (
    error instanceof ApiError ||
    error instanceof AuthError ||
    error instanceof RateLimitError ||
    error instanceof OtpDeliveryError
  ) {
    return jsonError(error);
  }

  // Unexpected errors must not expose database/internal details.
  return jsonError(
    new ApiError(
      'The request could not be completed. Please try again.',
      500,
      'INTERNAL_SERVER_ERROR'
    )
  );
}