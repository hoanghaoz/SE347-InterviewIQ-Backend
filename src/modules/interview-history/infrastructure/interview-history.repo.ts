import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { PaginationRequest } from '../../../shared/common/pagination';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { CommonSessionStatus } from '../../interview/domain/enums/interview-enum';
import { mapCheatEventTypeToDomain } from '../../interview/infrastructure/cheat-log.mapper';
import {
  mapDifficultyToDomain,
  mapDomainToDomain,
} from '../../question-generation/infrastructure/question-mapper';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../scoring/domain/entities/scoring-job.entity';
import {
  IInterviewHistoryRepository,
  InterviewHistoryDetailData,
  InterviewHistoryFilter,
  InterviewHistoryPage,
} from '../domain/repositories/interview-history.repo.interface';

// Màn danh sách: không select jobDescription (cột Text) và cvSnapshot (cột Json),
// chỉ kéo overallScore từ quan hệ score trong cùng một query nên không có N+1.
const LIST_SELECT = {
  publicId: true,
  title: true,
  status: true,
  totalQuestions: true,
  durationSeconds: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  score: { select: { overallScore: true } },
  // Đếm trong cùng query, không kéo cả danh sách log ra màn danh sách.
  _count: { select: { cheatLogs: true } },
} as const;

const DETAIL_SELECT = {
  publicId: true,
  title: true,
  jobDescription: true,
  status: true,
  totalQuestions: true,
  durationSeconds: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  createdAt: true,
  cv: { select: { publicId: true, fileName: true } },
  cheatLogs: {
    select: {
      publicId: true,
      eventType: true,
      description: true,
      occurredAt: true,
      createdAt: true,
    },
    // Ép kiểu mảng mutable: `as const` của cả object sẽ biến nó thành tuple readonly
    // mà Prisma không nhận.
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] as (
      | { occurredAt: 'asc' }
      | { id: 'asc' }
    )[],
  },
  // Câu hỏi, câu trả lời, điểm và nhận xét được kéo trong cùng lời gọi findFirst:
  // số câu SQL cố định theo số quan hệ, không tăng theo số câu hỏi (không N+1).
  questions: {
    select: {
      publicId: true,
      orderIndex: true,
      content: true,
      domain: true,
      difficulty: true,
      // Không select emotionSummary (Json chỉ worker dùng). Video chỉ là URL,
      // không có binary nào nằm trong database.
      answer: {
        select: { videoUrl: true, durationSeconds: true, transcript: true },
      },
    },
    // (sessionId, orderIndex) là unique nên orderIndex đủ để thứ tự ổn định.
    orderBy: { orderIndex: 'asc' },
  },
  score: {
    select: {
      contentScore: true,
      relevanceScore: true,
      confidenceScore: true,
      overallScore: true,
      scoredAt: true,
    },
  },
  // Không select scoringModel / promptVersion: đó là chi tiết vận hành nội bộ.
  interviewSummary: {
    select: { overallFeedback: true, strengths: true, improvements: true },
  },
} as const;

// strengths/improvements là cột Json nên Prisma trả về kiểu không xác định.
// Chỉ giữ phần tử đúng shape và copy tường minh từng field, để một bản ghi hỏng
// không làm vỡ response và key lạ trong Json không lọt ra ngoài.
type FeedbackRecord = Record<string, unknown> & {
  category: string;
  title: string;
  description: string;
};

function isFeedbackRecord(value: unknown): value is FeedbackRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.category === 'string' &&
    typeof record.title === 'string' &&
    typeof record.description === 'string'
  );
}

function toStrengths(value: unknown): StrengthItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFeedbackRecord).map((item) => ({
    category: item.category,
    title: item.title,
    description: item.description,
  }));
}

function toImprovements(value: unknown): ImprovementItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFeedbackRecord).map((item) => ({
    category: item.category,
    title: item.title,
    description: item.description,
    ...(typeof item.suggestion === 'string'
      ? { suggestion: item.suggestion }
      : {}),
  }));
}

@Injectable()
export class InterviewHistoryRepository implements IInterviewHistoryRepository {
  private readonly logger = new Logger(InterviewHistoryRepository.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getInterviewHistory(
    userPublicId: string,
    pagination: PaginationRequest,
    filter: InterviewHistoryFilter,
  ): Promise<Result<InterviewHistoryPage, Error>> {
    try {
      const { pageNumber, pageSize } = pagination;
      const where = {
        user: { publicId: userPublicId },
        ...(filter.status === undefined
          ? {}
          : { status: SessionStatus[filter.status] }),
        ...(filter.fromDate === undefined && filter.toDate === undefined
          ? {}
          : {
              createdAt: {
                ...(filter.fromDate === undefined
                  ? {}
                  : { gte: filter.fromDate }),
                // lte, không lt: mốc toDate được tính vào kết quả
                ...(filter.toDate === undefined ? {} : { lte: filter.toDate }),
              },
            }),
      };

      const [sessions, totalItems] = await Promise.all([
        this.prismaService.interviewSession.findMany({
          where,
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
          // Khớp index [userId, createdAt desc]; thêm id để thứ tự ổn định khi
          // hai buổi phỏng vấn trùng createdAt
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: LIST_SELECT,
        }),
        this.prismaService.interviewSession.count({ where }),
      ]);

      const items = sessions.map((session) => ({
        sessionPublicId: session.publicId,
        title: session.title,
        status: CommonSessionStatus[session.status],
        totalQuestions: session.totalQuestions,
        durationSeconds: session.durationSeconds,
        overallScore: session.score?.overallScore ?? null,
        cheatEventCount: session._count.cheatLogs,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        createdAt: session.createdAt,
      }));

      return ok({ items, totalItems });
    } catch (error) {
      this.logger.error(
        `getInterviewHistory failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the interview history'));
    }
  }

  async getInterviewDetail(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<InterviewHistoryDetailData | null, Error>> {
    try {
      // findFirst chứ không findUnique: điều kiện gồm cả chủ sở hữu, nên một
      // publicId của người khác trả null y như publicId không tồn tại.
      const session = await this.prismaService.interviewSession.findFirst({
        where: {
          publicId: sessionPublicId,
          user: { publicId: userPublicId },
        },
        select: DETAIL_SELECT,
      });
      if (!session) {
        return ok(null);
      }

      return ok({
        sessionPublicId: session.publicId,
        title: session.title,
        jobDescription: session.jobDescription,
        status: CommonSessionStatus[session.status],
        totalQuestions: session.totalQuestions,
        durationSeconds: session.durationSeconds,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        completedAt: session.completedAt,
        createdAt: session.createdAt,
        cv: session.cv
          ? { cvPublicId: session.cv.publicId, fileName: session.cv.fileName }
          : null,
        cheatLogs: session.cheatLogs.map((log) => ({
          cheatLogPublicId: log.publicId,
          eventType: mapCheatEventTypeToDomain(log.eventType),
          description: log.description,
          occurredAt: log.occurredAt,
          createdAt: log.createdAt,
        })),
        questions: session.questions.map((question) => ({
          questionPublicId: question.publicId,
          orderIndex: question.orderIndex,
          content: question.content,
          domain: mapDomainToDomain(question.domain),
          difficulty: mapDifficultyToDomain(question.difficulty),
          answer: question.answer
            ? {
                videoUrl: question.answer.videoUrl,
                durationSeconds: question.answer.durationSeconds,
                transcript: question.answer.transcript,
              }
            : null,
        })),
        score: session.score
          ? {
              contentScore: session.score.contentScore,
              relevanceScore: session.score.relevanceScore,
              confidenceScore: session.score.confidenceScore,
              overallScore: session.score.overallScore,
              scoredAt: session.score.scoredAt,
            }
          : null,
        summary: session.interviewSummary
          ? {
              overallFeedback: session.interviewSummary.overallFeedback,
              strengths: toStrengths(session.interviewSummary.strengths),
              improvements: toImprovements(
                session.interviewSummary.improvements,
              ),
            }
          : null,
      });
    } catch (error) {
      this.logger.error(
        `getInterviewDetail failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the interview'));
    }
  }
}
