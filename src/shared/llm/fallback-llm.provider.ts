import { Logger } from '@nestjs/common';
import { err, Result } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import { LLM_UNAVAILABLE_MESSAGE } from './llm-error.mapper';
import { ILlmProvider } from './llm.provider';
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmTextRequest,
  LlmTextResult,
} from './llm.types';

/**
 * Tries the primary provider and, on any failure except BadRequest (which no
 * other vendor can fix), tries the secondary one.
 */
export class FallbackLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(FallbackLlmProvider.name);

  constructor(
    private readonly primary: ILlmProvider,
    private readonly secondary: ILlmProvider,
  ) {}

  generateText(
    request: LlmTextRequest,
  ): Promise<Result<LlmTextResult, AppError>> {
    return this.runWithFallbackAsync((provider) =>
      provider.generateText(request),
    );
  }

  generateJson<T>(
    request: LlmJsonRequest,
  ): Promise<Result<LlmJsonResult<T>, AppError>> {
    return this.runWithFallbackAsync((provider) =>
      provider.generateJson<T>(request),
    );
  }

  private async runWithFallbackAsync<T>(
    operation: (provider: ILlmProvider) => Promise<Result<T, AppError>>,
  ): Promise<Result<T, AppError>> {
    const primaryResult = await operation(this.primary);

    if (
      primaryResult.isOk() ||
      primaryResult.error.code === ErrorCode.BadRequest
    ) {
      return primaryResult;
    }

    this.logger.warn(
      `Primary LLM provider failed (${primaryResult.error.code}); trying the secondary provider`,
    );

    const secondaryResult = await operation(this.secondary);
    if (secondaryResult.isOk()) {
      return secondaryResult;
    }

    this.logger.error(
      `Both LLM providers failed (primary: ${primaryResult.error.code}, secondary: ${secondaryResult.error.code})`,
    );
    return err(
      new AppError(ErrorCode.InternalServerError, LLM_UNAVAILABLE_MESSAGE),
    );
  }
}
