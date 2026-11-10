import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import {
  activeTraceIds,
  errorCodeOf,
  extractTraceContext,
  injectTraceContext,
  withResultSpan,
  withSpan,
} from './telemetry';

describe('telemetry helpers', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  beforeAll(() => {
    provider.register();
  });

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  beforeEach(() => {
    exporter.reset();
  });

  describe('withSpan', () => {
    it('ends the span and returns the value', async () => {
      const value = await withSpan('unit.ok', { 'unit.key': 'v' }, () => 42);

      expect(value).toBe(42);
      const [span] = exporter.getFinishedSpans();
      expect(span.name).toBe('unit.ok');
      expect(span.attributes['unit.key']).toBe('v');
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
    });

    it('records the exception, marks ERROR and rethrows', async () => {
      await expect(
        withSpan('unit.throw', {}, () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const [span] = exporter.getFinishedSpans();
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.events.some((event) => event.name === 'exception')).toBe(
        true,
      );
    });

    it('nests spans under the active one', async () => {
      await withSpan('unit.parent', {}, () =>
        withSpan('unit.child', {}, () => undefined),
      );

      const spans = exporter.getFinishedSpans();
      const parent = spans.find((span) => span.name === 'unit.parent')!;
      const child = spans.find((span) => span.name === 'unit.child')!;
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    });
  });

  describe('withResultSpan', () => {
    it('leaves the span OK for an Ok result', async () => {
      const result = await withResultSpan('unit.result.ok', {}, () =>
        Promise.resolve(ok('fine')),
      );

      expect(result._unsafeUnwrap()).toBe('fine');
      expect(exporter.getFinishedSpans()[0].status.code).toBe(
        SpanStatusCode.UNSET,
      );
    });

    it('marks ERROR with the AppError code for an Err result', async () => {
      const result = await withResultSpan('unit.result.err', {}, () =>
        Promise.resolve(err(new AppError(ErrorCode.Conflict, 'taken'))),
      );

      expect(result.isErr()).toBe(true);
      const [span] = exporter.getFinishedSpans();
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('taken');
      expect(span.attributes['error.code']).toBe(ErrorCode.Conflict);
    });
  });

  describe('trace context propagation', () => {
    it('carries the trace through inject and extract', async () => {
      let carrier: Record<string, string> = {};
      let producerTraceId = '';

      await withSpan('unit.producer', {}, () => {
        carrier = injectTraceContext();
        producerTraceId = activeTraceIds()!.traceId;
      });

      expect(carrier.traceparent).toContain(producerTraceId);

      await withSpan(
        'unit.consumer',
        {},
        () => undefined,
        extractTraceContext(carrier),
      );

      const consumer = exporter
        .getFinishedSpans()
        .find((span) => span.name === 'unit.consumer')!;
      expect(consumer.spanContext().traceId).toBe(producerTraceId);
    });

    it('reports no trace ids outside a span', () => {
      expect(activeTraceIds()).toBeUndefined();
    });
  });

  describe('errorCodeOf', () => {
    it('prefers a string code, then the class name', () => {
      expect(errorCodeOf(new AppError(ErrorCode.NotFound, 'x'))).toBe(
        ErrorCode.NotFound,
      );
      expect(errorCodeOf(new TypeError('x'))).toBe('TypeError');
      expect(errorCodeOf('plain')).toBe('Error');
    });
  });
});
