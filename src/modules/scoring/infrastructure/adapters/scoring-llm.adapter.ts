import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { ILlmProvider } from '../../../../shared/llm/llm.provider';
import {
  IScoringLlmProvider,
  type ScoringLlmEvaluationResult,
  type ScoringLlmPayload,
} from '../../application/interfaces/scoring-llm.interface';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../domain/entities/scoring-job.entity';
import { FeedbackCategory } from '../../domain/enums/scoring-enum';
import { validateScoringRubric } from '../../domain/scoring-rubric.validator';
import {
  SCORING_PROMPT_VERSION,
  SCORING_RUBRIC_SCHEMA,
  SCORING_SYSTEM_PROMPT,
  buildScoringPrompt,
} from './scoring-prompt.builder';

export { SCORING_PROMPT_VERSION, SCORING_RUBRIC_SCHEMA, SCORING_SYSTEM_PROMPT };

export const MAX_RUBRIC_ATTEMPTS = 2;
export const SCORING_TEMPERATURE = 0.2;
export const SCORING_MAX_OUTPUT_TOKENS = 4096;

export interface ScoringRubricRawResponse {
  contentScore: number;
  relevanceScore: number;
  confidenceScore: number;
  overallScore?: number;
  overallFeedback: string;
  strengths: StrengthItem[];
  improvements: ImprovementItem[];
}

function hasAnyTranscript(payload: ScoringLlmPayload): boolean {
  if (payload.questions.length === 0) {
    return false;
  }

  return payload.questions.some(
    (q) =>
      typeof q.transcript === 'string' &&
      q.transcript.replaceAll('\u0000', '').trim().length > 0,
  );
}

function buildRuleBasedEmptyEvaluation(): ScoringLlmEvaluationResult {
  return {
    contentScore: 0,
    relevanceScore: 0,
    confidenceScore: 0,
    overallScore: 0,
    overallFeedback:
      'Ứng viên chưa cung cấp nội dung câu trả lời cho các câu hỏi trong phiên phỏng vấn nên hệ thống ghi nhận mức điểm 0.',
    strengths: [],
    improvements: [
      {
        category: FeedbackCategory.COMMUNICATION,
        title: 'Hoàn thành câu trả lời cho các câu hỏi phỏng vấn',
        description:
          'Toàn bộ câu hỏi trong phiên phỏng vấn bị bỏ trống hoặc không ghi nhận được giọng nói.',
        suggestion:
          'Hãy kiểm tra thiết bị thu âm (microphone) và trả lời đầy đủ từng câu hỏi theo cấu trúc Situation - Task - Action - Result (STAR).',
      },
    ],
    scoringModel: 'rule-based',
    promptVersion: SCORING_PROMPT_VERSION,
    provider: 'rule-based',
    latencyMs: 0,
  };
}

@Injectable()
export class ScoringLlmAdapter implements IScoringLlmProvider {
  private readonly logger = new Logger(ScoringLlmAdapter.name);

  constructor(private readonly llmProvider: ILlmProvider) {}

  async evaluateSession(
    payload: ScoringLlmPayload,
  ): Promise<Result<ScoringLlmEvaluationResult, AppError>> {
    if (!hasAnyTranscript(payload)) {
      this.logger.log(
        `Session ${payload.sessionPublicId} has no non-empty transcripts. Returning deterministic rule-based zero evaluation.`,
      );
      return ok(buildRuleBasedEmptyEvaluation());
    }

    this.logger.log(
      `Evaluating interview session ${payload.sessionPublicId} via ILlmProvider...`,
    );

    const { systemPrompt, prompt } = buildScoringPrompt(payload);

    for (let attempt = 1; attempt <= MAX_RUBRIC_ATTEMPTS; attempt++) {
      const llmResult = await this.llmProvider.generateJson<unknown>({
        systemPrompt,
        prompt,
        schema: SCORING_RUBRIC_SCHEMA,
        temperature: SCORING_TEMPERATURE,
        maxOutputTokens: SCORING_MAX_OUTPUT_TOKENS,
      });

      if (llmResult.isErr()) {
        this.logger.error(
          `LLM provider returned error for session ${payload.sessionPublicId}: ${llmResult.error.message}`,
        );
        return err(llmResult.error);
      }

      const { data, model, provider, latencyMs, usage } = llmResult.value;
      const validated = validateScoringRubric(data);

      if (validated.isOk()) {
        const rubric = validated.value;
        const evaluation: ScoringLlmEvaluationResult = {
          contentScore: rubric.contentScore,
          relevanceScore: rubric.relevanceScore,
          confidenceScore: rubric.confidenceScore,
          overallScore: rubric.overallScore,
          overallFeedback: rubric.overallFeedback,
          strengths: rubric.strengths,
          improvements: rubric.improvements,
          scoringModel: model,
          promptVersion: SCORING_PROMPT_VERSION,
          provider,
          latencyMs,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        };

        this.logger.log(
          `LLM evaluation succeeded for session ${payload.sessionPublicId} using model: ${model} (attempt ${attempt}/${MAX_RUBRIC_ATTEMPTS})`,
        );

        return ok(evaluation);
      }

      this.logger.warn(
        `Invalid scoring rubric for session ${payload.sessionPublicId} (attempt ${attempt}/${MAX_RUBRIC_ATTEMPTS}): ${validated.error.message}`,
      );
    }

    return err(
      new AppError(
        ErrorCode.InternalServerError,
        'AI provider returned an invalid scoring rubric',
      ),
    );
  }
}
