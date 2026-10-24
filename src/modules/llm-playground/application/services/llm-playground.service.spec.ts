import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import type { LlmProviderLookup } from '../../../../shared/llm/llm.constants';
import type { ILlmProvider } from '../../../../shared/llm/llm.provider';
import {
  PlaygroundMode,
  PlaygroundProvider,
  RunPlaygroundRequestDto,
} from '../dtos/run-playground.request.dto';
import { LlmPlaygroundService } from './llm-playground.service';

const makeFake = () => ({ generateText: jest.fn(), generateJson: jest.fn() });

const buildRequest = (
  overrides: Partial<RunPlaygroundRequestDto> = {},
): RunPlaygroundRequestDto =>
  Object.assign(new RunPlaygroundRequestDto(), {
    mode: PlaygroundMode.TEXT,
    provider: PlaygroundProvider.DEFAULT,
    prompt: 'hello',
    ...overrides,
  });

describe('LlmPlaygroundService', () => {
  const defaultProvider = makeFake();
  const gemini = makeFake();
  const groq = makeFake();
  const service = new LlmPlaygroundService(defaultProvider, {
    gemini: gemini as unknown as ILlmProvider,
    groq: groq as unknown as ILlmProvider,
  } satisfies LlmProviderLookup);

  beforeEach(() => {
    [defaultProvider, gemini, groq].forEach((fake) => {
      fake.generateText.mockReset();
      fake.generateJson.mockReset();
    });
  });

  it('runs text mode on the default provider and maps the result', async () => {
    defaultProvider.generateText.mockResolvedValue(
      ok({
        text: 'hi there',
        provider: 'gemini',
        model: 'm',
        latencyMs: 12,
        usage: { inputTokens: 1, outputTokens: 2 },
      }),
    );

    const result = await service.runAsync(
      buildRequest({ systemPrompt: 'sys', temperature: 0.5 }),
    );

    expect(defaultProvider.generateText).toHaveBeenCalledWith({
      prompt: 'hello',
      systemPrompt: 'sys',
      temperature: 0.5,
    });
    expect(result._unsafeUnwrap()).toEqual({
      output: 'hi there',
      provider: 'gemini',
      model: 'm',
      latencyMs: 12,
      usage: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it('uses the selected vendor instead of the default', async () => {
    groq.generateText.mockResolvedValue(
      ok({ text: 'g', provider: 'groq', model: 'm', latencyMs: 1 }),
    );

    await service.runAsync(buildRequest({ provider: PlaygroundProvider.GROQ }));

    expect(groq.generateText).toHaveBeenCalledTimes(1);
    expect(defaultProvider.generateText).not.toHaveBeenCalled();
    expect(gemini.generateText).not.toHaveBeenCalled();
  });

  it('runs JSON mode with the parsed schema and pretty-prints the data', async () => {
    gemini.generateJson.mockResolvedValue(
      ok({ data: { a: 1 }, provider: 'gemini', model: 'm', latencyMs: 1 }),
    );

    const result = await service.runAsync(
      buildRequest({
        mode: PlaygroundMode.JSON,
        provider: PlaygroundProvider.GEMINI,
        schema: '{"type":"object"}',
      }),
    );

    expect(gemini.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ schema: { type: 'object' } }),
    );
    expect(result._unsafeUnwrap().output).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it.each([
    ['is missing', undefined],
    ['is blank', '   '],
    ['is not valid JSON', '{not json'],
    ['is a JSON array', '[1,2]'],
    ['is a JSON string', '"text"'],
  ])(
    'returns BadRequest in JSON mode when the schema %s',
    async (_label, schema) => {
      const result = await service.runAsync(
        buildRequest({ mode: PlaygroundMode.JSON, schema }),
      );

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.BadRequest);
      expect(defaultProvider.generateJson).not.toHaveBeenCalled();
    },
  );

  it('passes a vendor failure through unchanged', async () => {
    const failure = new AppError(ErrorCode.InternalServerError, 'down');
    defaultProvider.generateText.mockResolvedValue(err(failure));

    const result = await service.runAsync(buildRequest());

    expect(result._unsafeUnwrapErr()).toBe(failure);
  });
});
