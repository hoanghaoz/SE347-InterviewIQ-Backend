import type { Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import {
  describeLlmError,
  LLM_UNAVAILABLE_MESSAGE,
  mapLlmError,
} from './llm-error.mapper';
import { parseJsonOutput } from './llm-json.util';
import { ILlmProvider } from './llm.provider';
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmProviderName,
  LlmRawCompletion,
  LlmResultMeta,
  LlmTextRequest,
  LlmTextResult,
  LlmUsage,
} from './llm.types';

const MAX_JSON_ATTEMPTS = 2;

/**
 * Shared behavior for vendor providers: timing, error mapping, empty-output
 * detection and the JSON retry. Subclasses only perform the SDK call.
 */
export abstract class BaseLlmVendorProvider implements ILlmProvider {
  protected abstract readonly providerName: LlmProviderName;
  protected abstract readonly model: string;
  protected abstract readonly logger: Logger;

  protected abstract isConfigured(): boolean;

  /** Performs the SDK call. May throw; the base class maps the error. */
  protected abstract completeAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmRawCompletion>;

  async generateText(
    request: LlmTextRequest,
  ): Promise<Result<LlmTextResult, AppError>> {
    const startedAt = Date.now();
    const completion = await this.tryCompleteAsync(request);

    if (completion.isErr()) {
      return err(completion.error);
    }

    if (completion.value.text.trim() === '') {
      this.logger.warn(`${this.providerName} returned an empty response`);
      return err(
        new AppError(ErrorCode.InternalServerError, LLM_UNAVAILABLE_MESSAGE),
      );
    }

    return ok({
      ...this.buildMeta(startedAt, completion.value.usage),
      text: completion.value.text,
    });
  }

  async generateJson<T>(
    request: LlmJsonRequest,
  ): Promise<Result<LlmJsonResult<T>, AppError>> {
    const startedAt = Date.now();
    const { schema, ...textRequest } = request;

    for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
      const completion = await this.tryCompleteAsync(textRequest, schema);

      if (completion.isErr()) {
        return err(completion.error);
      }

      const parsed = parseJsonOutput(completion.value.text);
      if (parsed.isOk()) {
        return ok({
          ...this.buildMeta(startedAt, completion.value.usage),
          data: parsed.value as T,
        });
      }

      this.logger.warn(
        `${this.providerName} returned invalid JSON (attempt ${attempt}/${MAX_JSON_ATTEMPTS})`,
      );
    }

    return err(
      new AppError(
        ErrorCode.InternalServerError,
        'The AI provider returned an invalid JSON response',
      ),
    );
  }

  private async tryCompleteAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<Result<LlmRawCompletion, AppError>> {
    if (!this.isConfigured()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `The ${this.providerName} provider is not configured`,
        ),
      );
    }

    try {
      return ok(await this.completeAsync(request, jsonSchema));
    } catch (error) {
      this.logger.warn(
        `${this.providerName} request failed: ${describeLlmError(error)}`,
      );
      return err(mapLlmError(error));
    }
  }

  private buildMeta(startedAt: number, usage?: LlmUsage): LlmResultMeta {
    return {
      provider: this.providerName,
      model: this.model,
      latencyMs: Date.now() - startedAt,
      usage,
    };
  }
}
