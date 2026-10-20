import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type {
  IScoringLlmProvider,
  ScoringLlmEvaluationResult,
  ScoringLlmPayload,
} from '../../application/interfaces/scoring-llm.interface';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../domain/entities/scoring-job.entity';

export const SCORING_PROMPT_VERSION = 'v1.0';

export interface ScoringRubricRawResponse {
  contentScore: number;
  relevanceScore: number;
  confidenceScore: number;
  overallScore?: number;
  overallFeedback: string;
  strengths: StrengthItem[];
  improvements: ImprovementItem[];
}

export const SCORING_RUBRIC_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: [
    'contentScore',
    'relevanceScore',
    'confidenceScore',
    'overallFeedback',
    'strengths',
    'improvements',
  ],
  properties: {
    contentScore: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description: 'Điểm chất lượng nội dung chuyên môn (thang điểm 0 - 10)',
    },
    relevanceScore: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description: 'Điểm mức độ phù hợp và bám sát câu hỏi (thang điểm 0 - 10)',
    },
    confidenceScore: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description: 'Điểm phong thái, sự tự tin và diễn đạt (thang điểm 0 - 10)',
    },
    overallScore: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description: 'Điểm tổng kết quy đổi (thang điểm 0 - 10, tùy chọn)',
    },
    overallFeedback: {
      type: 'string',
      description:
        'Nhận xét tổng quan toàn diện về ứng viên bằng tiếng Việt chuẩn văn phong tuyển dụng',
    },
    strengths: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'title', 'description'],
        properties: {
          category: {
            type: 'string',
            description:
              'Phân loại thế mạnh (ví dụ: TECHNICAL_KNOWLEDGE, PROBLEM_SOLVING, COMMUNICATION)',
          },
          title: {
            type: 'string',
            description: 'Tiêu đề ngắn gọn của thế mạnh',
          },
          description: {
            type: 'string',
            description: 'Mô tả chi tiết dẫn chứng từ câu trả lời',
          },
        },
      },
    },
    improvements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'title', 'description'],
        properties: {
          category: {
            type: 'string',
            description: 'Phân loại điểm cần cải thiện',
          },
          title: {
            type: 'string',
            description: 'Tiêu đề ngắn gọn điểm cần cải thiện',
          },
          description: {
            type: 'string',
            description: 'Mô tả chi tiết hạn chế của câu trả lời',
          },
          suggestion: {
            type: 'string',
            description:
              'Gợi ý phương pháp cải thiện cụ thể (ví dụ: mô hình STAR, kỹ thuật cụ thể)',
          },
        },
      },
    },
  },
};

export const SCORING_SYSTEM_PROMPT = `Bạn là chuyên gia phỏng vấn và đánh giá nhân sự cấp cao (Senior Technical Interviewer & HR Assessor) của nền tảng MockMate AI.
Nhiệm vụ của bạn là đánh giá công tâm, chính xác và chuyên nghiệp toàn bộ phiên phỏng vấn của ứng viên dựa trên CV (nếu có) và danh sách câu hỏi kèm bản ghi câu trả lời (transcript).
Nguyên tắc đánh giá:
1. Thang điểm: 0.0 đến 10.0 (chính xác đến 1 chữ số thập phân).
   - contentScore: Đánh giá độ chính xác kiến thức, độ sâu kỹ thuật và tính logic.
   - relevanceScore: Đánh giá mức độ trả lời đúng trọng tâm câu hỏi, không lan man.
   - confidenceScore: Đánh giá cách hành văn, phong thái, cấu trúc câu và sự tự tin thể hiện qua nội dung.
2. Ngôn ngữ phản hồi: Toàn bộ nhận xét (overallFeedback, strengths, improvements) PHẢI bằng TIẾNG VIỆT tự nhiên, trang trọng, chuẩn văn phong tuyển dụng chuyên nghiệp.
3. Cấu trúc JSON: Trả về chính xác theo định dạng JSON Schema được yêu cầu, không thêm bất kỳ văn bản nào ngoài JSON.`;

@Injectable()
export class ScoringLlmAdapter implements IScoringLlmProvider {
  private readonly logger = new Logger(ScoringLlmAdapter.name);

  constructor(private readonly llmProvider: ILlmProvider) {}

  async evaluateSession(
    payload: ScoringLlmPayload,
  ): Promise<Result<ScoringLlmEvaluationResult, Error>> {
    this.logger.log(
      `Evaluating interview session ${payload.sessionPublicId} via ILlmProvider...`,
    );

    const userPrompt = this.buildUserPrompt(payload);

    const llmResult =
      await this.llmProvider.generateJson<ScoringRubricRawResponse>({
        systemPrompt: SCORING_SYSTEM_PROMPT,
        prompt: userPrompt,
        schema: SCORING_RUBRIC_SCHEMA,
        temperature: 0.2,
      });

    if (llmResult.isErr()) {
      this.logger.error(
        `LLM provider returned error for session ${payload.sessionPublicId}: ${llmResult.error.message}`,
      );
      return err(new Error(llmResult.error.message));
    }

    const { data, model } = llmResult.value;

    const normalizedResult: ScoringLlmEvaluationResult = {
      contentScore: this.clampScore(data.contentScore),
      relevanceScore: this.clampScore(data.relevanceScore),
      confidenceScore: this.clampScore(data.confidenceScore),
      overallScore:
        data.overallScore !== undefined
          ? this.clampScore(data.overallScore)
          : undefined,
      overallFeedback:
        data.overallFeedback?.trim() ||
        'Ứng viên đã hoàn thành buổi phỏng vấn.',
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      improvements: Array.isArray(data.improvements) ? data.improvements : [],
      scoringModel: model,
      promptVersion: SCORING_PROMPT_VERSION,
    };

    this.logger.log(
      `LLM evaluation succeeded for session ${payload.sessionPublicId} using model: ${model}`,
    );

    return ok(normalizedResult);
  }

  private buildUserPrompt(payload: ScoringLlmPayload): string {
    const cvSection = payload.cvParsedData
      ? `=== THÔNG TIN HỒ SƠ ỨNG VIÊN (CV) ===\n${JSON.stringify(
          payload.cvParsedData,
          null,
          2,
        )}`
      : '=== THÔNG TIN HỒ SƠ ỨNG VIÊN (CV) ===\nKhông có thông tin CV hoặc CV chưa được phân tích.';

    const questionsSection = payload.questions
      .map((q, idx) => {
        const transcriptText = q.transcript?.trim()
          ? q.transcript.trim()
          : '(Ứng viên không trả lời hoặc câu trả lời bị im lặng)';
        const emotionText = q.emotionSummary
          ? `\n  - Chỉ số cảm xúc / phong thái: ${JSON.stringify(q.emotionSummary)}`
          : '';
        return `Câu hỏi ${idx + 1} (Thứ tự: ${q.orderIndex}):
  - Nội dung câu hỏi: "${q.content}"
  - Câu trả lời của ứng viên: "${transcriptText}"${emotionText}`;
      })
      .join('\n\n');

    return `Dưới đây là thông tin chi tiết phiên phỏng vấn (Session ID: ${payload.sessionPublicId}):

${cvSection}

=== DANH SÁCH CÂU HỎI & CÂU TRẢ LỜI ===
${questionsSection}

=== YÊU CẦU ĐÁNH GIÁ ===
Dựa trên hồ sơ CV và phần trả lời của các câu hỏi trên, hãy thực hiện chấm điểm và phân tích điểm mạnh, điểm cần cải thiện theo đúng JSON Schema đã quy định.`;
  }

  private clampScore(score: number): number {
    const num = Number(score);
    if (isNaN(num)) return 0;
    const clamped = Math.max(0, Math.min(10, num));
    return Number(clamped.toFixed(1));
  }
}
