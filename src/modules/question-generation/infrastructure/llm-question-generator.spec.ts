import type { ConfigService } from '@nestjs/config';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../shared/common/errorCode';
import type { ILlmProvider } from '../../../shared/llm/llm.provider';
import type { QuestionGenerationInput } from '../application/interfaces/question-generator.interface';
import {
  GENERATION_FAILED_MESSAGE,
  LlmQuestionGenerator,
  readGenerationTimeoutMs,
} from './llm-question-generator';

const input: QuestionGenerationInput = {
  parsedData: {
    summary: null,
    skills: { languages: [], frameworks: [], databases: [], tools: [] },
    experiences: [],
    education: [],
    projects: [],
  },
  jobDescription: null,
  count: 2,
};

const validOutput = {
  questions: [
    { content: 'Question one?', domain: 'TECHNICAL', difficulty: 'EASY' },
    { content: 'Question two?', domain: 'BEHAVIORAL', difficulty: 'HARD' },
  ],
};

const llmResult = (data: unknown) =>
  ok({
    data,
    provider: 'gemini' as const,
    model: 'test-model',
    latencyMs: 1,
  });

function createConfig(value?: string): ConfigService {
  return { get: jest.fn().mockReturnValue(value) } as unknown as ConfigService;
}

describe('LlmQuestionGenerator', () => {
  let generateJson: jest.Mock;
  let generator: LlmQuestionGenerator;

  beforeEach(() => {
    generateJson = jest.fn();
    generator = new LlmQuestionGenerator(
      { generateJson } as unknown as ILlmProvider,
      createConfig(),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the validated questions with order indexes', async () => {
    generateJson.mockResolvedValue(llmResult(validOutput));

    const result = await generator.generateAsync(input);

    expect(result._unsafeUnwrap()).toEqual([
      {
        orderIndex: 1,
        content: 'Question one?',
        domain: 'TECHNICAL',
        difficulty: 'EASY',
      },
      {
        orderIndex: 2,
        content: 'Question two?',
        domain: 'BEHAVIORAL',
        difficulty: 'HARD',
      },
    ]);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.any(Object) as unknown,
        systemPrompt: expect.any(String) as unknown,
        prompt: expect.any(String) as unknown,
      }),
    );
  });

  it('retries once when the first output breaks the contract', async () => {
    generateJson
      .mockResolvedValueOnce(llmResult({ questions: [] }))
      .mockResolvedValueOnce(llmResult(validOutput));

    const result = await generator.generateAsync(input);

    expect(result.isOk()).toBe(true);
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it('fails with a generic error after two invalid outputs', async () => {
    generateJson.mockResolvedValue(llmResult({ questions: [] }));

    const error = (await generator.generateAsync(input))._unsafeUnwrapErr();

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(error.code).toBe(ErrorCode.InternalServerError);
    expect(error.message).toBe(GENERATION_FAILED_MESSAGE);
  });

  it('does not retry when the LLM call fails and hides its message', async () => {
    generateJson.mockResolvedValue(
      err(new AppError(ErrorCode.TooManyRequests, 'quota exceeded for key x')),
    );

    const error = (await generator.generateAsync(input))._unsafeUnwrapErr();

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(error.code).toBe(ErrorCode.InternalServerError);
    expect(error.message).toBe(GENERATION_FAILED_MESSAGE);
  });

  it('fails when the overall timeout passes before the LLM answers', async () => {
    jest.useFakeTimers();
    generateJson.mockReturnValue(new Promise(() => undefined));

    const pending = generator.generateAsync(input);
    await jest.advanceTimersByTimeAsync(45_000);

    const error = (await pending)._unsafeUnwrapErr();
    expect(error.message).toBe(GENERATION_FAILED_MESSAGE);
  });
});

describe('readGenerationTimeoutMs', () => {
  it.each([
    ['12000', 12_000],
    [undefined, 45_000],
    ['abc', 45_000],
    ['0', 45_000],
    ['-5', 45_000],
  ])('reads %p as %p', (value, expected) => {
    expect(readGenerationTimeoutMs(createConfig(value))).toBe(expected);
  });
});
