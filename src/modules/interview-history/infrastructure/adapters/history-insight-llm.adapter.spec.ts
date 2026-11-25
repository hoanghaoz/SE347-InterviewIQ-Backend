import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import type { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type { HistoryInsightLlmPayload } from '../../application/interfaces/history-insight-llm.interface';
import { countFeedbackCategories } from '../../domain/history-insight.rules';
import {
  HistoryInsightLlmAdapter,
  INSIGHT_MAX_OUTPUT_TOKENS,
  INSIGHT_TEMPERATURE,
} from './history-insight-llm.adapter';
import {
  HISTORY_INSIGHT_PROMPT_VERSION,
  HISTORY_INSIGHT_SCHEMA,
  HISTORY_INSIGHT_SYSTEM_PROMPT,
} from './history-insight-prompt.builder';

describe('HistoryInsightLlmAdapter', () => {
  const generateJson = jest.fn();
  const adapter = new HistoryInsightLlmAdapter({
    generateJson,
  } as unknown as ILlmProvider);

  const payload: HistoryInsightLlmPayload = {
    stats: {
      maxScore: 10,
      completedSessions: 2,
      answeredQuestions: 8,
      averages: null,
      best: null,
      trend: [],
      comparison: null,
    },
    sessions: [],
    categoryCounts: countFeedbackCategories([]),
  };

  const insight = {
    overallFeedback: 'Tiến bộ đều.',
    strengths: [],
    weaknesses: [
      { category: 'COMMUNICATION', title: 'Dài dòng', description: 'Đi vòng' },
    ],
    recommendations: [{ title: 'STAR', description: 'Luyện kể chuyện' }],
  };

  const llmOk = (data: unknown) =>
    ok({
      data,
      model: 'gemini-2.5-flash',
      provider: 'gemini',
      latencyMs: 1200,
    });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('asks for JSON with the insight schema and a telemetry purpose', async () => {
    generateJson.mockResolvedValue(llmOk(insight));

    await adapter.generateInsight(payload);

    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: HISTORY_INSIGHT_SYSTEM_PROMPT,
        schema: HISTORY_INSIGHT_SCHEMA,
        temperature: INSIGHT_TEMPERATURE,
        maxOutputTokens: INSIGHT_MAX_OUTPUT_TOKENS,
        purpose: 'history_insight',
      }),
    );
  });

  it('returns the validated insight with model metadata', async () => {
    generateJson.mockResolvedValue(llmOk(insight));

    const result = await adapter.generateInsight(payload);

    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({
      ...insight,
      model: 'gemini-2.5-flash',
      promptVersion: HISTORY_INSIGHT_PROMPT_VERSION,
      provider: 'gemini',
      latencyMs: 1200,
    });
  });

  it('asks again once when the first answer has the wrong shape', async () => {
    generateJson
      .mockResolvedValueOnce(llmOk({ overallFeedback: '' }))
      .mockResolvedValueOnce(llmOk(insight));

    const result = await adapter.generateInsight(payload);

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(result.isOk()).toBe(true);
  });

  it('gives up after two invalid answers', async () => {
    generateJson.mockResolvedValue(llmOk({ weaknesses: [] }));

    const result = await adapter.generateInsight(payload);

    expect(generateJson).toHaveBeenCalledTimes(2);
    if (result.isOk()) throw new Error('Expected an error');
    expect(result.error.code).toBe(ErrorCode.InternalServerError);
    expect(result.error.message).toBe(
      'AI provider returned an invalid insight',
    );
  });

  // Lỗi của provider không được hỏi lại: fallback và retry đã chạy bên trong
  it('returns a provider error without retrying', async () => {
    const providerError = new AppError(
      ErrorCode.TooManyRequests,
      'Rate limited',
    );
    generateJson.mockResolvedValue(err(providerError));

    const result = await adapter.generateInsight(payload);

    expect(generateJson).toHaveBeenCalledTimes(1);
    if (result.isOk()) throw new Error('Expected an error');
    expect(result.error).toBe(providerError);
  });
});
