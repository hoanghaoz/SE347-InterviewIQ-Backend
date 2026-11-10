import { Attributes, metrics, MeterProvider } from '@opentelemetry/api';
import { resetInstrumentsForTesting } from './metrics';

export interface RecordedMetric {
  name: string;
  value: number;
  attributes: Attributes;
}

/**
 * Test helper: swaps in a MeterProvider that records every counter `add` and
 * histogram `record`. (The API's no-op instruments are one shared object, so
 * spying on them cannot tell two metrics apart.)
 */
export function recordMetrics() {
  const calls: RecordedMetric[] = [];
  const push = (name: string) => (value: number, attributes?: Attributes) => {
    calls.push({ name, value, attributes: attributes ?? {} });
  };
  const meter = {
    createCounter: (name: string) => ({ add: push(name) }),
    createHistogram: (name: string) => ({ record: push(name) }),
    createObservableGauge: () => ({ addCallback: () => undefined }),
  };

  metrics.disable();
  metrics.setGlobalMeterProvider({
    getMeter: () => meter,
  } as unknown as MeterProvider);
  resetInstrumentsForTesting();

  return {
    calls,
    named: (name: string): RecordedMetric[] =>
      calls.filter((call) => call.name === name),
    stop: () => {
      metrics.disable();
      resetInstrumentsForTesting();
    },
  };
}
