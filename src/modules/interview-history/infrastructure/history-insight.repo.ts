import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { RULE_BASED_SCORING_MODEL } from '../../scoring/domain/constants/scoring.constants';
import {
  HistoryFingerprint,
  HistoryInsightData,
  IHistoryInsightRepository,
  InsightSessionData,
  NewHistoryInsight,
} from '../domain/repositories/history-insight.repo.interface';
import {
  toFeedbackItems,
  toImprovements,
  toRecommendations,
} from './feedback-json.mapper';

// Không select llmModel / promptVersion: đó là chi tiết vận hành nội bộ, giống
// scoringModel của trang chi tiết.
const INSIGHT_SELECT = {
  overallFeedback: true,
  strengths: true,
  weaknesses: true,
  recommendations: true,
  basedOnSessionCount: true,
  lastSessionCompletedAt: true,
  generatedAt: true,
} as const;

// Chỉ những gì prompt cần: không jobDescription, cvSnapshot hay transcript.
// scoringModel chỉ để nhận ra buổi bỏ trống chấm theo luật.
const INSIGHT_SESSION_SELECT = {
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
  interviewSummary: {
    select: { scoringModel: true, strengths: true, improvements: true },
  },
} as const;

type InsightRow = {
  overallFeedback: string;
  strengths: unknown;
  weaknesses: unknown;
  recommendations: unknown;
  basedOnSessionCount: number;
  lastSessionCompletedAt: Date | null;
  generatedAt: Date;
};

function toInsightData(row: InsightRow): HistoryInsightData {
  return {
    overallFeedback: row.overallFeedback,
    strengths: toFeedbackItems(row.strengths),
    weaknesses: toFeedbackItems(row.weaknesses),
    recommendations: toRecommendations(row.recommendations),
    basedOnSessionCount: row.basedOnSessionCount,
    lastSessionCompletedAt: row.lastSessionCompletedAt,
    generatedAt: row.generatedAt,
  };
}

// Chỉ buổi COMPLETED, cùng luật với trang chi tiết và thống kê.
function completedSessionsOf(userPublicId: string) {
  return {
    user: { publicId: userPublicId },
    status: SessionStatus.COMPLETED,
  };
}

@Injectable()
export class HistoryInsightRepository implements IHistoryInsightRepository {
  private readonly logger = new Logger(HistoryInsightRepository.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getHistoryFingerprint(
    userPublicId: string,
  ): Promise<Result<HistoryFingerprint, Error>> {
    try {
      const aggregate = await this.prismaService.interviewSession.aggregate({
        where: completedSessionsOf(userPublicId),
        _count: { _all: true },
        _max: { completedAt: true },
      });
      return ok({
        completedSessions: aggregate._count._all,
        lastCompletedAt: aggregate._max.completedAt ?? null,
      });
    } catch (error) {
      this.logger.error(
        `getHistoryFingerprint failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the history fingerprint'));
    }
  }

  async getInsightSessions(
    userPublicId: string,
    limit: number,
  ): Promise<Result<InsightSessionData[], Error>> {
    try {
      const rows = await this.prismaService.interviewSession.findMany({
        where: { ...completedSessionsOf(userPublicId), score: { isNot: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: INSIGHT_SESSION_SELECT,
      });

      return ok(
        rows.flatMap((row) =>
          row.score
            ? [
                {
                  title: row.title,
                  createdAt: row.createdAt,
                  contentScore: row.score.contentScore,
                  relevanceScore: row.score.relevanceScore,
                  confidenceScore: row.score.confidenceScore,
                  overallScore: row.score.overallScore,
                  isRuleBased:
                    row.interviewSummary?.scoringModel ===
                    RULE_BASED_SCORING_MODEL,
                  strengths: toFeedbackItems(row.interviewSummary?.strengths),
                  improvements: toImprovements(
                    row.interviewSummary?.improvements,
                  ),
                },
              ]
            : [],
        ),
      );
    } catch (error) {
      this.logger.error(
        `getInsightSessions failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the insight sessions'));
    }
  }

  async findInsight(
    userPublicId: string,
  ): Promise<Result<HistoryInsightData | null, Error>> {
    try {
      const row = await this.prismaService.userInsight.findFirst({
        where: { user: { publicId: userPublicId } },
        select: INSIGHT_SELECT,
      });
      return ok(row ? toInsightData(row) : null);
    } catch (error) {
      this.logger.error(`findInsight failed: ${(error as Error).message}`);
      return err(new Error('Failed to get the insight'));
    }
  }

  async saveInsight(
    userPublicId: string,
    insight: NewHistoryInsight,
  ): Promise<Result<HistoryInsightData | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { publicId: userPublicId },
        select: { id: true },
      });
      if (!user) {
        return ok(null);
      }

      // Copy tường minh từng field để chỉ đúng shape đã validate được ghi xuống.
      const data = {
        overallFeedback: insight.overallFeedback,
        strengths: insight.strengths.map((item) => ({
          category: item.category,
          title: item.title,
          description: item.description,
        })),
        weaknesses: insight.weaknesses.map((item) => ({
          category: item.category,
          title: item.title,
          description: item.description,
        })),
        recommendations: insight.recommendations.map((item) => ({
          title: item.title,
          description: item.description,
        })),
        basedOnSessionCount: insight.basedOnSessionCount,
        lastSessionCompletedAt: insight.lastSessionCompletedAt,
        llmModel: insight.llmModel,
        promptVersion: insight.promptVersion,
        generatedAt: insight.generatedAt,
      };

      // userId là unique nên upsert ghi đè bản cũ, mỗi user chỉ có một nhận xét.
      const row = await this.prismaService.userInsight.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
        select: INSIGHT_SELECT,
      });
      return ok(toInsightData(row));
    } catch (error) {
      this.logger.error(`saveInsight failed: ${(error as Error).message}`);
      return err(new Error('Failed to save the insight'));
    }
  }
}
