import { context, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OtelLogger } from './otel-logger';
import { withSpan } from './telemetry';

describe('OtelLogger', () => {
  const emitted: Array<Record<string, unknown>> = [];
  const provider = new NodeTracerProvider();
  let stdout: jest.SpyInstance;
  let logger: OtelLogger;

  const printed = () =>
    (stdout.mock.calls as unknown[][]).map((call) => String(call[0])).join('');

  beforeAll(() => {
    provider.register();
    logs.setGlobalLoggerProvider({
      getLogger: () => ({
        enabled: () => true,
        emit: (record: Record<string, unknown>) => emitted.push(record),
      }),
    });
  });

  afterAll(async () => {
    await provider.shutdown();
    logs.disable();
    trace.disable();
    context.disable();
  });

  beforeEach(() => {
    emitted.length = 0;
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger = new OtelLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('appends trace and span ids inside an active span', async () => {
    await withSpan('unit.log', {}, () => {
      logger.log('hello', 'MyContext');
    });

    expect(printed()).toMatch(
      /hello \[trace_id=[0-9a-f]{32} span_id=[0-9a-f]{16}\]/,
    );
  });

  it('leaves the line untouched outside a span', () => {
    logger.log('plain', 'MyContext');

    expect(printed()).toContain('plain');
    expect(printed()).not.toContain('trace_id=');
  });

  it('forwards log, warn and error records with severity and context', () => {
    logger.log('a', 'Ctx');
    logger.warn('b', 'Ctx');
    logger.error('c', 'stack-trace', 'Ctx');

    expect(emitted.map((r) => [r.severityText, r.body])).toEqual([
      ['LOG', 'a'],
      ['WARN', 'b'],
      ['ERROR', 'c'],
    ]);
    expect(emitted.map((r) => r.severityNumber)).toEqual([
      SeverityNumber.INFO,
      SeverityNumber.WARN,
      SeverityNumber.ERROR,
    ]);
    expect(emitted[0].attributes).toEqual({ 'log.context': 'Ctx' });
    expect(emitted[2].attributes).toEqual({ 'log.context': 'Ctx' });
  });

  it('does not ship debug or verbose records', () => {
    logger.debug('noisy', 'Ctx');
    logger.verbose('noisier', 'Ctx');

    expect(emitted).toHaveLength(0);
  });

  it('keeps logging when the log pipeline throws', () => {
    logs.disable();
    logs.setGlobalLoggerProvider({
      getLogger: () => ({
        enabled: () => true,
        emit: () => {
          throw new Error('exporter down');
        },
      }),
    });

    expect(() => logger.log('still works', 'Ctx')).not.toThrow();
    expect(printed()).toContain('still works');
  });
});
