import { Inject, Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  LLM_PROVIDER_LOOKUP,
  type LlmProviderLookup,
} from '../../../../shared/llm/llm.constants';
import { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type { LlmResultMeta } from '../../../../shared/llm/llm.types';
import type { PlaygroundRunResponseDto } from '../dtos/playground-run.response.dto';
import {
  PlaygroundMode,
  PlaygroundProvider,
  RunPlaygroundRequestDto,
} from '../dtos/run-playground.request.dto';
import { ILlmPlaygroundService } from '../interfaces/llm-playground.service.interface';

@Injectable()
export class LlmPlaygroundService implements ILlmPlaygroundService {
  constructor(
    private readonly defaultProvider: ILlmProvider,
    @Inject(LLM_PROVIDER_LOOKUP)
    private readonly providers: LlmProviderLookup,
  ) {}

  async runAsync(
    request: RunPlaygroundRequestDto,
  ): Promise<Result<PlaygroundRunResponseDto, AppError>> {
    const provider = this.pickProvider(request.provider);
    const base = {
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      temperature: request.temperature,
    };

    if (request.mode === PlaygroundMode.TEXT) {
      const result = await provider.generateText(base);
      return result.map((value) => this.toResponse(value, value.text));
    }

    const schema = this.parseSchema(request.schema);
    if (schema.isErr()) {
      return err(schema.error);
    }

    const result = await provider.generateJson<unknown>({
      ...base,
      schema: schema.value,
    });
    return result.map((value) =>
      this.toResponse(value, JSON.stringify(value.data, null, 2)),
    );
  }

  private pickProvider(selected: PlaygroundProvider): ILlmProvider {
    switch (selected) {
      case PlaygroundProvider.GEMINI:
        return this.providers.gemini;
      case PlaygroundProvider.GROQ:
        return this.providers.groq;
      default:
        return this.defaultProvider;
    }
  }

  private parseSchema(
    raw: string | undefined,
  ): Result<Record<string, unknown>, AppError> {
    if (raw === undefined || raw.trim() === '') {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'A JSON schema is required in JSON mode',
        ),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err(
        new AppError(ErrorCode.BadRequest, 'The schema is not valid JSON'),
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return err(
        new AppError(ErrorCode.BadRequest, 'The schema must be a JSON object'),
      );
    }

    return ok(parsed as Record<string, unknown>);
  }

  private toResponse(
    meta: LlmResultMeta,
    output: string,
  ): PlaygroundRunResponseDto {
    return {
      output,
      provider: meta.provider,
      model: meta.model,
      latencyMs: meta.latencyMs,
      usage: meta.usage,
    };
  }
}
