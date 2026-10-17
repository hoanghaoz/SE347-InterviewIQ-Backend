import { ErrorCode } from '../common/errorCode';
import {
  describeLlmError,
  LLM_UNAVAILABLE_MESSAGE,
  mapLlmError,
} from './llm-error.mapper';

describe('mapLlmError', () => {
  it.each([400, 422])('maps HTTP %i to BadRequest', (status) => {
    expect(mapLlmError({ status }).code).toBe(ErrorCode.BadRequest);
  });

  it('maps HTTP 429 to TooManyRequests', () => {
    expect(mapLlmError({ status: 429 }).code).toBe(ErrorCode.TooManyRequests);
  });

  it.each([401, 403, 500, 503])(
    'maps HTTP %i to InternalServerError with the generic message',
    (status) => {
      const error = mapLlmError({ status });

      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
    },
  );

  it('maps errors without a status (timeout, network) to InternalServerError', () => {
    const error = mapLlmError(new Error('Request timed out.'));

    expect(error.code).toBe(ErrorCode.InternalServerError);
    expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
  });

  it('never leaks the vendor message', () => {
    const error = mapLlmError({ status: 500, message: 'secret-key-abc bad' });

    expect(error.message).not.toContain('secret-key-abc');
  });
});

describe('describeLlmError', () => {
  it('returns the message of an Error', () => {
    expect(describeLlmError(new Error('boom'))).toBe('boom');
  });

  it('stringifies anything else', () => {
    expect(describeLlmError('plain')).toBe('plain');
  });
});
