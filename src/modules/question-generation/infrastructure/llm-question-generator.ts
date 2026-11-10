import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../shared/common/errorCode';
import { ILlmProvider } from '../../../shared/llm/llm.provider';
import {
  IQuestionGenerator,
  type QuestionGenerationInput,
} from '../application/interfaces/question-generator.interface';
import { DEFAULT_GENERATION_TIMEOUT_MS } from '../domain/constants/question-generation.constants';
import type { GeneratedQuestion } from '../domain/repositories/question-generation.repo.interface';
import { validateQuestionSet } from '../domain/question-set.validator';
import {
  buildQuestionPrompt,
  buildQuestionSchema,
} from './question-prompt.builder';

const MAX_ATTEMPTS = 2;
const TEMPERATURE = 0.7;
const MAX_OUTPUT_TOKENS = 4096;

export const GENERATION_FAILED_MESSAGE =
  'Failed to generate interview questions';

export function readGenerationTimeoutMs(config: ConfigService): number {
  const parsed = Number(config.get<string>('QUESTION_GENERATION_TIMEOUT_MS'));
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_GENERATION_TIMEOUT_MS;
}

@Injectable()
export class LlmQuestionGenerator implements IQuestionGenerator {
  private readonly logger = new Logger(LlmQuestionGenerator.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly llm: ILlmProvider,
    config: ConfigService,
  ) {
    this.timeoutMs = readGenerationTimeoutMs(config);
  }

  async generateAsync(
    input: QuestionGenerationInput,
  ): Promise<Result<GeneratedQuestion[], AppError>> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<Result<GeneratedQuestion[], AppError>>(
      (resolve) => {
        timer = setTimeout(() => {
          this.logger.warn(`Generation timed out after ${this.timeoutMs}ms`);
          resolve(err(this.failure()));
        }, this.timeoutMs);
      },
    );

    try {
      return await Promise.race([this.attemptAsync(input), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Retries only when the output breaks the contract, never on LLM errors or
  // timeouts, so the caller does not wait for several slow calls in a row.
  private async attemptAsync(
    input: QuestionGenerationInput,
  ): Promise<Result<GeneratedQuestion[], AppError>> {
    const { systemPrompt, prompt } = buildQuestionPrompt(input);
    const schema = buildQuestionSchema(input.count);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await this.llm.generateJson<unknown>({
        systemPrompt,
        prompt,
        schema,
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        purpose: 'question_generation',
      });
      if (response.isErr()) {
        this.logger.warn(`LLM call failed: ${response.error.message}`);
        return err(this.failure());
      }

      const validated = validateQuestionSet(response.value.data, input.count);
      if (validated.isOk()) {
        return ok(validated.value);
      }
      this.logger.warn(
        `Invalid question set (attempt ${attempt}/${MAX_ATTEMPTS}): ${validated.error.message}`,
      );
    }

    return err(this.failure());
  }

  private failure(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      GENERATION_FAILED_MESSAGE,
    );
  }
}
