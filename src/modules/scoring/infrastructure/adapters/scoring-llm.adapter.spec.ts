import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type {
  LlmJsonRequest,
  LlmJsonResult,
} from '../../../../shared/llm/llm.types';
import type { ScoringLlmPayload } from '../../application/interfaces/scoring-llm.interface';
import {
  SCORING_MAX_OUTPUT_TOKENS,
  SCORING_PROMPT_VERSION,
  SCORING_TEMPERATURE,
  ScoringLlmAdapter,
  type ScoringRubricRawResponse,
} from './scoring-llm.adapter';

class MockLlmProvider implements ILlmProvider {
  generateText = jest.fn();
  generateJson = jest.fn();
}

describe('ScoringLlmAdapter', () => {
  let adapter: ScoringLlmAdapter;
  let mockLlmProvider: MockLlmProvider;

  const samplePayload: ScoringLlmPayload = {
    sessionPublicId: 'session-uuid-123',
    title: 'Frontend Engineer Interview',
    jobDescription: 'Require React, TypeScript, and modern state management.',
    cvParsedData: {
      summary: 'Frontend Engineer with 2 years of experience',
      skills: {
        languages: ['TypeScript', 'JavaScript'],
        frameworks: ['React', 'NestJS'],
        databases: ['PostgreSQL'],
        tools: ['Git', 'Docker'],
      },
      experiences: [
        {
          company: 'Tech Corp',
          position: 'Frontend Engineer',
          startDate: '2024-01',
          endDate: null,
          description: 'Developing React frontend apps',
          technologies: ['TypeScript', 'React'],
        },
      ],
      education: [
        {
          institution: 'University of Technology',
          degree: 'Bachelor of Computer Science',
          graduationYear: 2024,
        },
      ],
      projects: [
        {
          name: 'MockMate',
          description: 'AI Interview Practice Platform',
          role: 'Frontend Developer',
        },
      ],
    },
    questions: [
      {
        content:
          'Explain the difference between interface and type in TypeScript.',
        orderIndex: 1,
        domain: 'TECHNICAL',
        difficulty: 'EASY',
        transcript:
          'Interfaces can be merged with declaration merging, while types cannot.',
        emotionSummary: {
          dominant: 'neutral',
          distribution: { neutral: 0.85, happy: 0.15 },
        },
        durationSeconds: 60,
      },
      {
        content: 'How do you optimize React component re-renders?',
        orderIndex: 2,
        domain: 'TECHNICAL',
        difficulty: 'MEDIUM',
        transcript: 'Use React.memo, useCallback, and useMemo.',
        emotionSummary: null,
        durationSeconds: 75,
      },
    ],
  };

  const validRubricData: ScoringRubricRawResponse = {
    contentScore: 8.5,
    relevanceScore: 8.0,
    confidenceScore: 7.5,
    overallFeedback: 'Ứng viên trả lời gãy gọn, đúng trọng tâm kỹ thuật.',
    strengths: [
      {
        category: 'TECHNICAL_KNOWLEDGE',
        title: 'Nắm vững TypeScript & React',
        description: 'Giải thích rõ ràng về declaration merging.',
      },
    ],
    improvements: [
      {
        category: 'COMMUNICATION',
        title: 'Cần mở rộng dẫn chứng thực tế',
        description: 'Nên đưa thêm ví dụ dự án cụ thể khi giải thích.',
        suggestion: 'Áp dụng mô hình STAR.',
      },
    ],
  };

  beforeEach(() => {
    mockLlmProvider = new MockLlmProvider();
    adapter = new ScoringLlmAdapter(mockLlmProvider);
  });

  it('should call generateJson with temperature 0.2 and maxOutputTokens 4096, compute overallScore = 8.1, and set promptVersion = v2.0', async () => {
    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 1250,
      usage: { inputTokens: 820, outputTokens: 340 },
      data: validRubricData,
    };

    mockLlmProvider.generateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.contentScore).toBe(8.5);
      expect(result.value.relevanceScore).toBe(8.0);
      expect(result.value.confidenceScore).toBe(7.5);
      expect(result.value.overallScore).toBe(8.1);
      expect(result.value.overallFeedback).toBe(
        'Ứng viên trả lời gãy gọn, đúng trọng tâm kỹ thuật.',
      );
      expect(result.value.strengths).toHaveLength(1);
      expect(result.value.improvements).toHaveLength(1);
      expect(result.value.scoringModel).toBe('gemini-3.8-flash');
      expect(result.value.promptVersion).toBe('v2.0');
      expect(result.value.promptVersion).toBe(SCORING_PROMPT_VERSION);
      expect(result.value.provider).toBe('gemini');
      expect(result.value.latencyMs).toBe(1250);
      expect(result.value.inputTokens).toBe(820);
      expect(result.value.outputTokens).toBe(340);
    }

    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(1);
    const calls = mockLlmProvider.generateJson.mock.calls as unknown as Array<
      [LlmJsonRequest]
    >;
    const passedRequest = calls[0][0];
    expect(passedRequest.temperature).toBe(SCORING_TEMPERATURE);
    expect(passedRequest.temperature).toBe(0.2);
    expect(passedRequest.maxOutputTokens).toBe(SCORING_MAX_OUTPUT_TOKENS);
    expect(passedRequest.maxOutputTokens).toBe(4096);
    expect(passedRequest.prompt).toContain('<cv_data>');
    expect(passedRequest.prompt).toContain('Tech Corp');
  });

  it('should preserve fallback model name when Groq answered', async () => {
    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      latencyMs: 2100,
      data: validRubricData,
    };

    mockLlmProvider.generateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.scoringModel).toBe('openai/gpt-oss-120b');
      expect(result.value.provider).toBe('groq');
    }
  });

  it('should clamp out-of-range scores safely between 0 and 10 and compute deterministic overallScore', async () => {
    const rawDataWithExtremeScores: ScoringRubricRawResponse = {
      contentScore: 12.5,
      relevanceScore: -3,
      confidenceScore: 9.999,
      overallScore: 15,
      overallFeedback: 'Phản hồi tốt.',
      strengths: [],
      improvements: [],
    };

    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 900,
      data: rawDataWithExtremeScores,
    };

    mockLlmProvider.generateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.contentScore).toBe(10);
      expect(result.value.relevanceScore).toBe(0);
      expect(result.value.confidenceScore).toBe(10);
      // 10 * 0.4 + 0 * 0.4 + 10 * 0.2 = 6.0
      expect(result.value.overallScore).toBe(6);
    }
  });

  it('should return rule-based zero evaluation without calling generateJson when all transcripts are empty or whitespace', async () => {
    const silentPayload: ScoringLlmPayload = {
      sessionPublicId: 'session-silent',
      cvParsedData: null,
      questions: [
        {
          content: 'Introduce yourself.',
          orderIndex: 1,
          transcript: null,
          emotionSummary: null,
        },
        {
          content: 'Explain SOLID principles.',
          orderIndex: 2,
          transcript: '   \n\t  ',
          emotionSummary: null,
        },
      ],
    };

    const result = await adapter.evaluateSession(silentPayload);

    expect(result.isOk()).toBe(true);
    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(0);

    if (result.isOk()) {
      expect(result.value.contentScore).toBe(0);
      expect(result.value.relevanceScore).toBe(0);
      expect(result.value.confidenceScore).toBe(0);
      expect(result.value.overallScore).toBe(0);
      expect(result.value.scoringModel).toBe('rule-based');
      expect(result.value.promptVersion).toBe('v2.0');
      expect(result.value.strengths).toEqual([]);
      expect(result.value.improvements.length).toBeGreaterThanOrEqual(1);
    }

    const emptyQuestionsResult = await adapter.evaluateSession({
      sessionPublicId: 'session-no-questions',
      cvParsedData: null,
      questions: [],
    });
    expect(emptyQuestionsResult.isOk()).toBe(true);
    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(0);
    if (emptyQuestionsResult.isOk()) {
      expect(emptyQuestionsResult.value.scoringModel).toBe('rule-based');
      expect(emptyQuestionsResult.value.overallScore).toBe(0);
    }
  });

  it('should handle payload without CV when at least one question has a transcript', async () => {
    const payloadWithoutCv: ScoringLlmPayload = {
      sessionPublicId: 'session-no-cv',
      cvParsedData: null,
      questions: [
        {
          content: 'Introduce yourself.',
          orderIndex: 1,
          transcript: 'Em là lập trình viên Backend với 2 năm kinh nghiệm.',
          emotionSummary: null,
        },
      ],
    };

    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 800,
      data: validRubricData,
    };

    mockLlmProvider.generateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(payloadWithoutCv);

    expect(result.isOk()).toBe(true);
    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(1);
    const calls = mockLlmProvider.generateJson.mock.calls as unknown as Array<
      [LlmJsonRequest]
    >;
    const passedRequest = calls[0][0];
    expect(passedRequest.prompt).toContain('Không có thông tin CV');
  });

  it('should retry once and succeed when first LLM response has NaN score and second attempt returns valid JSON', async () => {
    const invalidFirstResult: LlmJsonResult<unknown> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 700,
      data: {
        ...validRubricData,
        contentScore: Number.NaN,
      },
    };
    const validSecondResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      latencyMs: 1100,
      data: validRubricData,
    };

    mockLlmProvider.generateJson
      .mockResolvedValueOnce(ok(invalidFirstResult))
      .mockResolvedValueOnce(ok(validSecondResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(2);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.overallScore).toBe(8.1);
      expect(result.value.scoringModel).toBe('openai/gpt-oss-120b');
    }
  });

  it('should fail with InternalServerError AppError when both rubric attempts return invalid schema', async () => {
    const invalidResult: LlmJsonResult<unknown> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 650,
      data: {
        contentScore: 'eight',
        relevanceScore: null,
        confidenceScore: 7,
        overallFeedback: '   ',
        strengths: [],
        improvements: [],
      },
    };

    mockLlmProvider.generateJson
      .mockResolvedValueOnce(ok(invalidResult))
      .mockResolvedValueOnce(ok(invalidResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(2);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(AppError);
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toContain('invalid scoring rubric');
    }
  });

  it('should not retry inside adapter when ILlmProvider returns TooManyRequests or BadRequest AppError and should preserve error.code', async () => {
    mockLlmProvider.generateJson.mockResolvedValueOnce(
      err(
        new AppError(
          ErrorCode.TooManyRequests,
          'Rate limit exceeded on all LLM providers',
        ),
      ),
    );

    const rateLimitResult = await adapter.evaluateSession(samplePayload);

    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(1);
    expect(rateLimitResult.isErr()).toBe(true);
    if (rateLimitResult.isErr()) {
      expect(rateLimitResult.error).toBeInstanceOf(AppError);
      expect(rateLimitResult.error.code).toBe(ErrorCode.TooManyRequests);
    }

    mockLlmProvider.generateJson.mockReset();
    mockLlmProvider.generateJson.mockResolvedValueOnce(
      err(
        new AppError(ErrorCode.BadRequest, 'Prompt rejected by safety filter'),
      ),
    );

    const badRequestResult = await adapter.evaluateSession(samplePayload);

    expect(mockLlmProvider.generateJson).toHaveBeenCalledTimes(1);
    expect(badRequestResult.isErr()).toBe(true);
    if (badRequestResult.isErr()) {
      expect(badRequestResult.error).toBeInstanceOf(AppError);
      expect(badRequestResult.error.code).toBe(ErrorCode.BadRequest);
    }
  });
});
