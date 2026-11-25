import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { ILlmProvider } from '../../../../shared/llm/llm.provider';
import {
  IHistoryInsightLlm,
  type HistoryInsightLlmPayload,
  type HistoryInsightLlmResult,
} from '../../application/interfaces/history-insight-llm.interface';
import { validateHistoryInsight } from '../../domain/history-insight.validator';
import {
  HISTORY_INSIGHT_PROMPT_VERSION,
  HISTORY_INSIGHT_SCHEMA,
  buildHistoryInsightPrompt,
} from './history-insight-prompt.builder';

export const MAX_INSIGHT_ATTEMPTS = 2;
export const INSIGHT_TEMPERATURE = 0.3;
export const INSIGHT_MAX_OUTPUT_TOKENS = 4096;

@Injectable()
export class HistoryInsightLlmAdapter implements IHistoryInsightLlm {
  private readonly logger = new Logger(HistoryInsightLlmAdapter.name);

  constructor(private readonly llmProvider: ILlmProvider) {}

  async generateInsight(
    payload: HistoryInsightLlmPayload,
  ): Promise<Result<HistoryInsightLlmResult, AppError>> {
    const { systemPrompt, prompt } = buildHistoryInsightPrompt(payload);

    // Lỗi của provider (mạng, rate limit, hết lượt fallback) trả về ngay; chỉ
    // JSON sai shape mới được hỏi lại, vì hỏi lại lần nữa thường sửa được.
    for (let attempt = 1; attempt <= MAX_INSIGHT_ATTEMPTS; attempt++) {
      const llmResult = await this.llmProvider.generateJson<unknown>({
        systemPrompt,
        prompt,
        schema: HISTORY_INSIGHT_SCHEMA,
        temperature: INSIGHT_TEMPERATURE,
        maxOutputTokens: INSIGHT_MAX_OUTPUT_TOKENS,
        purpose: 'history_insight',
      });
      if (llmResult.isErr()) {
        this.logger.error(
          `LLM provider failed to generate a history insight: ${llmResult.error.message}`,
        );
        return err(llmResult.error);
      }

      const { data, model, provider, latencyMs } = llmResult.value;
      const validated = validateHistoryInsight(data);
      if (validated.isOk()) {
        return ok({
          ...validated.value,
          model,
          promptVersion: HISTORY_INSIGHT_PROMPT_VERSION,
          provider,
          latencyMs,
        });
      }

      this.logger.warn(
        `Invalid history insight (attempt ${attempt}/${MAX_INSIGHT_ATTEMPTS}): ${validated.error.message}`,
      );
    }

    return err(
      new AppError(
        ErrorCode.InternalServerError,
        'AI provider returned an invalid insight',
      ),
    );
  }
}
