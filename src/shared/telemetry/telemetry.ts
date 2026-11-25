import {
  Attributes,
  Context,
  context,
  propagation,
  Span,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type { Result } from 'neverthrow';

export const TELEMETRY_NAME = 'interviewiq-api';

/** W3C trace-context headers (`traceparent`, `tracestate`) in plain form. */
export type TraceCarrier = Record<string, string>;

export function getTracer() {
  return trace.getTracer(TELEMETRY_NAME);
}

/** Best-effort, low-cardinality label for an error (AppError code or class name). */
export function errorCodeOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code !== '') {
      return code;
    }
    return error.constructor?.name ?? 'Error';
  }
  return 'Error';
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Marks a span as failed without throwing; for errors returned as values. */
export function markSpanError(span: Span, error: unknown): void {
  span.setAttribute('error.code', errorCodeOf(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: errorMessageOf(error),
  });
}

/**
 * Runs `fn` inside an active span and always ends it. A throw is recorded on
 * the span and rethrown. Pass `parentContext` to continue a remote trace.
 */
export function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T> | T,
  parentContext?: Context,
): Promise<T> {
  const run = async (span: Span): Promise<T> => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      markSpanError(span, error);
      throw error;
    } finally {
      span.end();
    }
  };

  const tracer = getTracer();
  return parentContext
    ? tracer.startActiveSpan(name, { attributes }, parentContext, run)
    : tracer.startActiveSpan(name, { attributes }, run);
}

/**
 * Like `withSpan` for functions returning a `Result`. Failures are values, not
 * exceptions, so an `Err` is turned into an ERROR status carrying `error.code`.
 */
export function withResultSpan<T, E>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<Result<T, E>>,
  parentContext?: Context,
): Promise<Result<T, E>> {
  return withSpan(
    name,
    attributes,
    async (span) => {
      const result = await fn(span);
      if (result.isErr()) {
        markSpanError(span, result.error);
      }
      return result;
    },
    parentContext,
  );
}

/** Serialises the active trace context so it can travel through a queue. */
export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** Rebuilds a context from a carrier produced by `injectTraceContext`. */
export function extractTraceContext(carrier?: TraceCarrier): Context {
  return propagation.extract(context.active(), carrier ?? {});
}

/** Active trace and span ids for log correlation, or undefined outside a span. */
export function activeTraceIds():
  | { traceId: string; spanId: string }
  | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !trace.isSpanContextValid(spanContext)) {
    return undefined;
  }
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
}
