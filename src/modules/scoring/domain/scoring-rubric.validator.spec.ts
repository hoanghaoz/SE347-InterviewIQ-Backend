import { FeedbackCategory } from './enums/scoring-enum';
import { ScoringDomainError } from './errors/scoring-domain.error';
import { validateScoringRubric } from './scoring-rubric.validator';

describe('validateScoringRubric', () => {
  const validPayload = {
    contentScore: 8.5,
    relevanceScore: 8.0,
    confidenceScore: 7.5,
    overallScore: 9.9,
    overallFeedback:
      'Ứng viên nắm vững kiến thức chuyên môn và trả lời đúng trọng tâm.',
    strengths: [
      {
        category: 'TECHNICAL_KNOWLEDGE',
        title: 'Hiểu sâu kiến trúc NestJS',
        description: 'Giải thích rõ cơ chế Dependency Injection và Module.',
      },
    ],
    improvements: [
      {
        category: 'COMMUNICATION',
        title: 'Cần trình bày ngắn gọn hơn',
        description: 'Phần mở đầu câu trả lời số 2 còn hơi dài.',
        suggestion: 'Áp dụng cấu trúc STAR trong 60-90 giây.',
      },
    ],
  };

  it('should validate a valid rubric payload and compute deterministic overallScore (0.4/0.4/0.2)', () => {
    const result = validateScoringRubric(validPayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.contentScore).toBe(8.5);
      expect(result.value.relevanceScore).toBe(8.0);
      expect(result.value.confidenceScore).toBe(7.5);
      expect(result.value.overallScore).toBe(8.1);
      expect(result.value.overallFeedback).toBe(
        'Ứng viên nắm vững kiến thức chuyên môn và trả lời đúng trọng tâm.',
      );
      expect(result.value.strengths).toEqual([
        {
          category: FeedbackCategory.TECHNICAL_KNOWLEDGE,
          title: 'Hiểu sâu kiến trúc NestJS',
          description: 'Giải thích rõ cơ chế Dependency Injection và Module.',
        },
      ]);
      expect(result.value.improvements).toEqual([
        {
          category: FeedbackCategory.COMMUNICATION,
          title: 'Cần trình bày ngắn gọn hơn',
          description: 'Phần mở đầu câu trả lời số 2 còn hơi dài.',
          suggestion: 'Áp dụng cấu trúc STAR trong 60-90 giây.',
        },
      ]);
    }
  });

  it('should clamp slightly out-of-range scores to [0, 10] and round to 1 decimal place', () => {
    const result = validateScoringRubric({
      ...validPayload,
      contentScore: 10.4,
      relevanceScore: -0.5,
      confidenceScore: 8.56,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.contentScore).toBe(10);
      expect(result.value.relevanceScore).toBe(0);
      expect(result.value.confidenceScore).toBe(8.6);
      expect(result.value.overallScore).toBe(5.7);
    }
  });

  it('should reject NaN, string scores, null, or non-object payloads', () => {
    expect(validateScoringRubric(null).isErr()).toBe(true);
    expect(validateScoringRubric('invalid').isErr()).toBe(true);

    const nanScore = validateScoringRubric({
      ...validPayload,
      contentScore: Number.NaN,
    });
    expect(nanScore.isErr()).toBe(true);
    if (nanScore.isErr()) {
      expect(nanScore.error.errorCode).toBe(ScoringDomainError.ScoreOutOfRange);
    }

    const stringScore = validateScoringRubric({
      ...validPayload,
      relevanceScore: '8.5',
    });
    expect(stringScore.isErr()).toBe(true);
    if (stringScore.isErr()) {
      expect(stringScore.error.errorCode).toBe(
        ScoringDomainError.ScoreOutOfRange,
      );
    }

    const nullScore = validateScoringRubric({
      ...validPayload,
      confidenceScore: null,
    });
    expect(nullScore.isErr()).toBe(true);
    if (nullScore.isErr()) {
      expect(nullScore.error.errorCode).toBe(
        ScoringDomainError.ScoreOutOfRange,
      );
    }
  });

  it('should reject missing overallFeedback or overallFeedback containing only HTML tags/whitespace', () => {
    const missingFeedback = validateScoringRubric({
      ...validPayload,
      overallFeedback: undefined,
    });
    expect(missingFeedback.isErr()).toBe(true);
    if (missingFeedback.isErr()) {
      expect(missingFeedback.error.errorCode).toBe(
        ScoringDomainError.OverallFeedbackEmpty,
      );
    }

    const htmlOnlyFeedback = validateScoringRubric({
      ...validPayload,
      overallFeedback: '<b>   </b>',
    });
    expect(htmlOnlyFeedback.isErr()).toBe(true);
    if (htmlOnlyFeedback.isErr()) {
      expect(htmlOnlyFeedback.error.errorCode).toBe(
        ScoringDomainError.OverallFeedbackEmpty,
      );
    }
  });

  it('should strip null bytes, HTML tags (<script>, <b>), and Markdown syntax (** and #) from feedback fields', () => {
    const dirtyPayload = {
      ...validPayload,
      overallFeedback:
        '## **Nhận xét\u0000 tổng quan:** <script>alert(1)</script><b>Ứng viên</b> thể hiện tốt.',
      strengths: [
        {
          category: 'PROBLEM_SOLVING',
          title: '**Tư duy\u0000 giải quyết vấn đề**',
          description: '- <b>Phân tích</b> bottleneck rõ ràng.',
        },
      ],
      improvements: [
        {
          category: 'CONFIDENCE',
          title: '### <b>Sự tự tin</b>',
          description: '**Cần giữ nhịp độ** ổn định hơn.',
          suggestion:
            '<script></script>**Luyện tập** với đồng hồ bấm giờ\u0000.',
        },
      ],
    };

    const result = validateScoringRubric(dirtyPayload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.overallFeedback).toBe(
        'Nhận xét tổng quan: alert(1)Ứng viên thể hiện tốt.',
      );
      expect(result.value.strengths[0].title).toBe('Tư duy giải quyết vấn đề');
      expect(result.value.strengths[0].description).toBe(
        'Phân tích bottleneck rõ ràng.',
      );
      expect(result.value.improvements[0].title).toBe('Sự tự tin');
      expect(result.value.improvements[0].description).toBe(
        'Cần giữ nhịp độ ổn định hơn.',
      );
      expect(result.value.improvements[0].suggestion).toBe(
        'Luyện tập với đồng hồ bấm giờ.',
      );
    }
  });

  it('should map unknown category to FeedbackCategory.COMMUNICATION and preserve all 6 standard categories', () => {
    const result = validateScoringRubric({
      ...validPayload,
      strengths: [
        {
          category: 'SOFT_SKILLS',
          title: 'Giao tiếp tốt',
          description: 'Trình bày rõ ràng.',
        },
        {
          category: 'RELEVANCE',
          title: 'Bám sát JD',
          description: 'Trả lời đúng trọng tâm.',
        },
        {
          category: 'EXPERIENCE',
          title: 'Kinh nghiệm thực tế',
          description: 'Có dẫn chứng dự án thật.',
        },
      ],
      improvements: [
        {
          category: 'UNKNOWN_CATEGORY',
          title: 'Quản lý thời gian',
          description: 'Trả lời hơi dài.',
        },
      ],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.strengths[0].category).toBe(
        FeedbackCategory.COMMUNICATION,
      );
      expect(result.value.strengths[1].category).toBe(
        FeedbackCategory.RELEVANCE,
      );
      expect(result.value.strengths[2].category).toBe(
        FeedbackCategory.EXPERIENCE,
      );
      expect(result.value.improvements[0].category).toBe(
        FeedbackCategory.COMMUNICATION,
      );
    }
  });

  it('should filter out feedback items missing title or description and limit to max 5 items', () => {
    const manyStrengths = Array.from({ length: 7 }, (_, i) => ({
      category: 'TECHNICAL_KNOWLEDGE',
      title: `Điểm mạnh ${i + 1}`,
      description: `Mô tả chi tiết ${i + 1}`,
    }));

    const result = validateScoringRubric({
      ...validPayload,
      strengths: [
        {
          category: 'TECHNICAL_KNOWLEDGE',
          title: '   ',
          description: 'Hợp lệ',
        },
        {
          category: 'TECHNICAL_KNOWLEDGE',
          title: 'Hợp lệ',
          description: '<b> </b>',
        },
        ...manyStrengths,
      ],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.strengths).toHaveLength(5);
      expect(result.value.strengths[0].title).toBe('Điểm mạnh 1');
      expect(result.value.strengths[4].title).toBe('Điểm mạnh 5');
    }
  });
});
