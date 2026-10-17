import { AppError, ErrorCode } from '../common/errorCode';

export const LLM_UNAVAILABLE_MESSAGE = 'AI service is temporarily unavailable';

function readStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/**
 * Converts any vendor SDK failure into a user-safe AppError. The vendor's own
 * message is intentionally dropped so keys or internals never reach a response.
 */
export function mapLlmError(error: unknown): AppError {
  const status = readStatus(error);

  if (status === 400 || status === 422) {
    return new AppError(
      ErrorCode.BadRequest,
      'The AI provider rejected the request',
    );
  }

  if (status === 429) {
    return new AppError(
      ErrorCode.TooManyRequests,
      'The AI provider rate limit was reached',
    );
  }

  return new AppError(ErrorCode.InternalServerError, LLM_UNAVAILABLE_MESSAGE);
}

/** Text meant for server logs only. */
export function describeLlmError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
