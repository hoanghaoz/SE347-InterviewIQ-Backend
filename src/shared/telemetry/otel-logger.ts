import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { TELEMETRY_NAME, activeTraceIds } from './telemetry';

const SEVERITY: Partial<Record<LogLevel, SeverityNumber>> = {
  log: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

/**
 * Nest console logger that (1) appends the active trace and span ids to every
 * line so a log can be matched to its trace, and (2) forwards the record to
 * the OpenTelemetry Logs API so it reaches Loki with the same trace context.
 *
 * debug and verbose stay console-only: they are noisy (Prisma queries) and not
 * worth shipping.
 */
export class OtelLogger extends ConsoleLogger {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams, (m, p) => super.log(m, ...p));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams, (m, p) => super.warn(m, ...p));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams, (m, p) =>
      super.error(m, ...p),
    );
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams, (m, p) =>
      super.fatal(m, ...p),
    );
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams, (m, p) =>
      super.debug(m, ...p),
    );
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams, (m, p) =>
      super.verbose(m, ...p),
    );
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
    print: (message: unknown, params: unknown[]) => void,
  ): void {
    const ids = activeTraceIds();
    print(
      ids && typeof message === 'string'
        ? `${message} [trace_id=${ids.traceId} span_id=${ids.spanId}]`
        : message,
      optionalParams,
    );

    const severityNumber = SEVERITY[level];
    if (severityNumber === undefined) {
      return;
    }
    try {
      logs.getLogger(TELEMETRY_NAME).emit({
        severityNumber,
        severityText: level.toUpperCase(),
        body: bodyOf(message),
        attributes: { 'log.context': this.contextOf(optionalParams) },
      });
    } catch {
      // Logging must never break the request that triggered it.
    }
  }

  /** Nest's `Logger` appends its context name as the last string argument. */
  private contextOf(optionalParams: unknown[]): string {
    const last = optionalParams[optionalParams.length - 1];
    return typeof last === 'string' ? last : (this.context ?? 'App');
  }
}

function bodyOf(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  return JSON.stringify(message);
}
