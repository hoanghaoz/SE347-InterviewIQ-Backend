import type { ConfigService } from '@nestjs/config';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../shared/common/errorCode';
import type { ILlmProvider } from '../../../shared/llm/llm.provider';
import type { QuestionGenerationInput } from '../application/interfaces/question-generator.interface';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../domain/enums/question.enum';
import {
  GENERATION_FAILED_MESSAGE,
  LlmQuestionGenerator,
  readGenerationTimeoutMs,
} from './llm-question-generator';
import { buildQuestionSchema } from './question-prompt.builder';

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

describe('LlmQuestionGenerator constraints', () => {
  let generateJson: jest.Mock;
  let generator: LlmQuestionGenerator;
  const single: QuestionGenerationInput = { ...input, count: 1 };
  const answer = (content: string, domain = 'TECHNICAL', difficulty = 'EASY') =>
    llmResult({ questions: [{ content, domain, difficulty }] });

  beforeEach(() => {
    generateJson = jest.fn();
    generator = new LlmQuestionGenerator(
      { generateJson } as unknown as ILlmProvider,
      createConfig(),
    );
  });

  it('asks the model for the requested domain and difficulty and accepts a matching answer', async () => {
    generateJson.mockResolvedValue(answer('One?', 'BEHAVIORAL', 'HARD'));

    const result = await generator.generateAsync({
      ...single,
      domain: QuestionDomain.BEHAVIORAL,
      difficulty: QuestionDifficulty.HARD,
    });

    expect(result.isOk()).toBe(true);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: buildQuestionSchema(1, {
          domain: QuestionDomain.BEHAVIORAL,
          difficulty: QuestionDifficulty.HARD,
        }),
      }),
    );
  });

  it('retries once when the model ignores the requested domain', async () => {
    generateJson
      .mockResolvedValueOnce(answer('Wrong?', 'TECHNICAL'))
      .mockResolvedValueOnce(answer('Right?', 'BEHAVIORAL'));

    const result = await generator.generateAsync({
      ...single,
      domain: QuestionDomain.BEHAVIORAL,
    });

    expect(result._unsafeUnwrap()[0].content).toBe('Right?');
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it('fails after two answers that break the constraint', async () => {
    generateJson.mockResolvedValue(answer('Wrong?', 'TECHNICAL'));

    const result = await generator.generateAsync({
      ...single,
      domain: QuestionDomain.BEHAVIORAL,
    });

    expect(result._unsafeUnwrapErr().message).toBe(GENERATION_FAILED_MESSAGE);
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it('retries when the model repeats a question it was told to avoid', async () => {
    generateJson
      .mockResolvedValueOnce(answer('what is a thread?'))
      .mockResolvedValueOnce(answer('What is a process?'));

    const result = await generator.generateAsync({
      ...single,
      exclude: ['What is a thread?'],
    });

    expect(result._unsafeUnwrap()[0].content).toBe('What is a process?');
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
});
