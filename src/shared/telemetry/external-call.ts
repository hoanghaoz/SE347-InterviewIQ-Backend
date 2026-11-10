import { instruments, startTimer } from './metrics';
import { withSpan } from './telemetry';

/**
 * Traces and times one Cloudinary call. `operation` is a fixed, low-cardinality
 * name (e.g. `cv_download`). A rejected call is recorded as `error` (or
 * `not_found` for the SDK's HTTP 404) and rethrown untouched. Never put URLs
 * here: signed download URLs carry credentials.
 */
export function trackCloudinaryCall<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const elapsedSeconds = startTimer();
  let outcome = 'ok';

  return withSpan(
    `cloudinary.${operation}`,
    { 'peer.service': 'cloudinary', 'cloudinary.operation': operation },
    fn,
  )
    .catch((error: unknown) => {
      outcome = isNotFound(error) ? 'not_found' : 'error';
      throw error;
    })
    .finally(() => {
      instruments().cloudinaryRequestDuration.record(elapsedSeconds(), {
        operation,
        outcome,
      });
    });
}

function isNotFound(error: unknown): boolean {
  const details = (error as { error?: { http_code?: number } } | null)?.error;
  return details?.http_code === 404;
}
