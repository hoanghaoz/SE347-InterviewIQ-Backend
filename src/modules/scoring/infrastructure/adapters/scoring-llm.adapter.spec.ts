import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import type { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmTextRequest,
  LlmTextResult,
} from '../../../../shared/llm/llm.types';
import type { ScoringLlmPayload } from '../../application/interfaces/scoring-llm.interface';
import {
  SCORING_PROMPT_VERSION,
  ScoringLlmAdapter,
  type ScoringRubricRawResponse,
} from './scoring-llm.adapter';

describe('ScoringLlmAdapter', () => {
  let adapter: ScoringLlmAdapter;
  let mockGenerateJson: jest.Mock<
    Promise<Result<LlmJsonResult<ScoringRubricRawResponse>, AppError>>,
    [LlmJsonRequest]
  >;
  let mockGenerateText: jest.Mock<
    Promise<Result<LlmTextResult, AppError>>,
    [LlmTextRequest]
  >;
  let mockLlmProvider: ILlmProvider;

  const samplePayload: ScoringLlmPayload = {
    sessionPublicId: 'session-uuid-123',
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
        orderIndex: 0,
        transcript:
          'Interfaces can be merged with declaration merging, while types cannot.',
        emotionSummary: { confidence: 0.85 },
      },
      {
        content: 'How do you optimize React component re-renders?',
        orderIndex: 1,
        transcript: 'Use React.memo, useCallback, and useMemo.',
        emotionSummary: null,
      },
    ],
  };

  const validRubricData: ScoringRubricRawResponse = {
    contentScore: 8.5,
    relevanceScore: 8.0,
    confidenceScore: 7.5,
    overallScore: 8.1,
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
    mockGenerateJson = jest.fn<
      Promise<Result<LlmJsonResult<ScoringRubricRawResponse>, AppError>>,
      [LlmJsonRequest]
    >();
    mockGenerateText = jest.fn<
      Promise<Result<LlmTextResult, AppError>>,
      [LlmTextRequest]
    >();
    mockLlmProvider = {
      generateJson: mockGenerateJson,
      generateText: mockGenerateText,
    };
    adapter = new ScoringLlmAdapter(mockLlmProvider);
  });

  it('should successfully evaluate session and map model name from Gemini', async () => {
    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 1250,
      data: validRubricData,
    };

    mockGenerateJson.mockResolvedValue(ok(mockJsonResult));

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
      expect(result.value.promptVersion).toBe(SCORING_PROMPT_VERSION);
    }

    expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    const passedRequest = mockGenerateJson.mock.calls[0][0];
    expect(passedRequest.temperature).toBe(0.2);
    expect(passedRequest.prompt).toContain('Tech Corp');
  });

  it('should preserve fallback model name when Groq answered', async () => {
    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      latencyMs: 2100,
      data: validRubricData,
    };

    mockGenerateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.scoringModel).toBe('openai/gpt-oss-120b');
    }
  });

  it('should clamp out-of-range scores safely between 0 and 10', async () => {
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

    mockGenerateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(samplePayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.contentScore).toBe(10);
      expect(result.value.relevanceScore).toBe(0);
      expect(result.value.confidenceScore).toBe(10);
      expect(result.value.overallScore).toBe(10);
    }
  });

  it('should handle payload without CV and with silent answers', async () => {
    const payloadWithoutCv: ScoringLlmPayload = {
      sessionPublicId: 'session-no-cv',
      cvParsedData: null,
      questions: [
        {
          content: 'Introduce yourself.',
          orderIndex: 0,
          transcript: null,
          emotionSummary: null,
        },
      ],
    };

    const mockJsonResult: LlmJsonResult<ScoringRubricRawResponse> = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 800,
      data: {
        ...validRubricData,
        contentScore: 1,
        relevanceScore: 1,
        confidenceScore: 1,
        overallFeedback: 'Ứng viên không trả lời.',
      },
    };

    mockGenerateJson.mockResolvedValue(ok(mockJsonResult));

    const result = await adapter.evaluateSession(payloadWithoutCv);

    expect(result.isOk()).toBe(true);
    expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    const passedRequest = mockGenerateJson.mock.calls[0][0];
    expect(passedRequest.prompt).toContain('Không có thông tin CV');
  });

  it('should return error when ILlmProvider fails', async () => {
    mockGenerateJson.mockResolvedValue(
      err(
        new AppError(
          ErrorCode.TooManyRequests,
          'Rate limit exceeded on all LLM providers',
        ),
      ),
    );

    const result = await adapter.evaluateSession(samplePayload);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Rate limit exceeded');
    }
  });
});
