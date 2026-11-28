import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  IInterviewStatsRepository,
  InterviewStatsData,
  InterviewStatsFilter,
  InterviewStatsScores,
  InterviewStatsSessionData,
} from '../domain/repositories/interview-stats.repo.interface';

// Trend và buổi tốt nhất chỉ cần định danh, tiêu đề, mốc thời gian và 4 điểm:
// không kéo jobDescription, cvSnapshot hay summary về.
const STATS_SESSION_SELECT = {
  publicId: true,
  title: true,
  createdAt: true,
  score: {
    select: {
      contentScore: true,
      relevanceScore: true,
      confidenceScore: true,
      overallScore: true,
    },
  },
} as const;

type StatsSessionRow = {
  publicId: string;
  title: string;
  createdAt: Date;
  score: InterviewStatsScores | null;
};

function toSessionData(row: StatsSessionRow): InterviewStatsSessionData[] {
  // where đã chặn score null; nhánh này chỉ để kiểu dữ liệu không còn nullable.
  if (!row.score) return [];
  return [
    {
      sessionPublicId: row.publicId,
      title: row.title,
      createdAt: row.createdAt,
      contentScore: row.score.contentScore,
      relevanceScore: row.score.relevanceScore,
      confidenceScore: row.score.confidenceScore,
      overallScore: row.score.overallScore,
    },
  ];
}

@Injectable()
export class InterviewStatsRepository implements IInterviewStatsRepository {
  private readonly logger = new Logger(InterviewStatsRepository.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getInterviewStats(
    userPublicId: string,
    filter: InterviewStatsFilter,
    recentLimit: number,
  ): Promise<Result<InterviewStatsData, Error>> {
    try {
      // Chỉ tính buổi COMPLETED, cùng luật với trang chi tiết: buổi SCORING hay
      // FAILED có thể vẫn còn bản ghi score nhưng đó chưa phải kết quả cuối.
      // Buổi bị chấm 0 vì bỏ trống (scoringModel rule-based) vẫn là kết quả
      // thật nên được tính, vì vậy không lọc theo scoringModel.
      const sessionWhere = {
        user: { publicId: userPublicId },
        status: SessionStatus.COMPLETED,
        ...(filter.fromDate === undefined && filter.toDate === undefined
          ? {}
          : {
              createdAt: {
                ...(filter.fromDate === undefined
                  ? {}
                  : { gte: filter.fromDate }),
                ...(filter.toDate === undefined ? {} : { lte: filter.toDate }),
              },
            }),
      };
      const scoredSessionWhere = { ...sessionWhere, score: { isNot: null } };

      // Bốn câu độc lập chạy song song. Chúng không chung một snapshot: một buổi
      // vừa chấm xong giữa chừng có thể làm các con số lệch nhau 1 buổi, chấp
      // nhận được với dashboard.
      const [aggregate, answeredQuestions, recentRows, bestRow] =
        await Promise.all([
          // Trung bình do database tính, không kéo mọi dòng về Node.
          this.prismaService.score.aggregate({
            where: { session: sessionWhere },
            _avg: {
              contentScore: true,
              relevanceScore: true,
              confidenceScore: true,
              overallScore: true,
            },
            _count: { _all: true },
          }),
          this.prismaService.answer.count({
            where: {
              // Ghi rõ cả hai điều kiện: transcript NULL và chuỗi rỗng đều là
              // chưa trả lời.
              AND: [{ transcript: { not: null } }, { transcript: { not: '' } }],
              question: { session: sessionWhere },
            },
          }),
          // Cùng thứ tự với màn danh sách, khớp index [userId, createdAt desc].
          this.prismaService.interviewSession.findMany({
            where: scoredSessionWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: recentLimit,
            select: STATS_SESSION_SELECT,
          }),
          this.prismaService.interviewSession.findFirst({
            where: scoredSessionWhere,
            orderBy: [
              { score: { overallScore: 'desc' } },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            select: STATS_SESSION_SELECT,
          }),
        ]);

      const completedSessions = aggregate._count._all;
      const avg = aggregate._avg;
      const averages =
        completedSessions > 0 &&
        avg.contentScore !== null &&
        avg.relevanceScore !== null &&
        avg.confidenceScore !== null &&
        avg.overallScore !== null
          ? {
              contentScore: avg.contentScore,
              relevanceScore: avg.relevanceScore,
              confidenceScore: avg.confidenceScore,
              overallScore: avg.overallScore,
            }
          : null;

      return ok({
        completedSessions,
        answeredQuestions,
        averages,
        best: bestRow ? (toSessionData(bestRow)[0] ?? null) : null,
        recent: recentRows.flatMap(toSessionData),
      });
    } catch (error) {
      this.logger.error(
        `getInterviewStats failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the interview stats'));
    }
  }
}
