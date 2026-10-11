import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LlmPlaygroundEnabledGuard } from './llm-playground-enabled.guard';

const makeGuard = (value?: string) =>
  new LlmPlaygroundEnabledGuard({
    get: () => value,
  } as unknown as ConfigService);

describe('LlmPlaygroundEnabledGuard', () => {
  it('allows the request when ENABLE_LLM_PLAYGROUND is "true"', () => {
    expect(makeGuard('true').canActivate()).toBe(true);
  });

  it.each([undefined, 'false', '1', 'TRUE', ''])(
    'responds 404 when ENABLE_LLM_PLAYGROUND is %p',
    (value) => {
      expect(() => makeGuard(value).canActivate()).toThrow(NotFoundException);
    },
  );
});
