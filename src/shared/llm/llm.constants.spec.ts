import type { ConfigService } from '@nestjs/config';
import { DEFAULT_LLM_TIMEOUT_MS, readLlmTimeoutMs } from './llm.constants';

const makeConfig = (value?: string): ConfigService =>
  ({ get: () => value }) as unknown as ConfigService;

describe('readLlmTimeoutMs', () => {
  it('returns the default when unset', () => {
    expect(readLlmTimeoutMs(makeConfig())).toBe(DEFAULT_LLM_TIMEOUT_MS);
  });

  it('returns the configured positive integer', () => {
    expect(readLlmTimeoutMs(makeConfig('5000'))).toBe(5000);
  });

  it.each(['abc', '-5', '0', '1.5', ''])(
    'falls back to the default for "%s"',
    (value) => {
      expect(readLlmTimeoutMs(makeConfig(value))).toBe(DEFAULT_LLM_TIMEOUT_MS);
    },
  );
});
