import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { SessionStatus } from '../../../../generated/prisma/enums';
import type { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { CvParsedData } from '../../cv/domain/types/cv-parsed-data.type';
import {
  InterviewSummary,
  Score,
  ScoringResult,
} from '../domain/entities/scoring-job.entity';
import {
  IScoringRepository,
  type SessionOwnerInfo,
  type SessionScoringContext,
} from '../domain/repositories/scoring.repo.interface';
import { mapScoreToDomain, mapSummaryToDomain } from './scoring-mapper';

@Injectable()
export class ScoringRepository implements IScoringRepository {
  private readonly logger = new Logger(ScoringRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findSessionForScoring(
    sessionPublicId: string,
  ): Promise<Result<SessionScoringContext | null, Error>> {
    try {
      const session = await this.prisma.interviewSession.findUnique({
        where: { publicId: sessionPublicId },
        include: {
          cv: true,
          questions: {
            include: {
              answer: true,
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!session) {
        return ok(null);
      }

      let cvParsedData: CvParsedData | null = null;
      if (session.cv?.parsedData) {
        cvParsedData = session.cv.parsedData as unknown as CvParsedData;
      }

      const context: SessionScoringContext = {
        id: session.id,
        publicId: session.publicId,
        userId: session.userId,
        status: session.status,
        cvParsedData,
        questions: session.questions.map((q) => ({
          id: q.id,
          content: q.content,
          orderIndex: q.orderIndex,
          answer: q.answer
            ? {
                id: q.answer.id,
                transcript: q.answer.transcript,
                emotionSummary: q.answer.emotionSummary,
              }
            : null,
        })),
      };

      return ok(context);
    } catch (error) {
      this.logger.error(
        `Failed to find session for scoring '${sessionPublicId}': ${(error as Error).message}`,
      );
      return err(new Error('Failed to find session for scoring.'));
    }
  }

  async updateSessionStatus(
    sessionId: number,
    status: SessionStatus,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { status },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to update session status for sessionId ${sessionId}: ${(error as Error).message}`,
      );
      return err(new Error('Failed to update session status.'));
    }
  }

  async saveScoringResult(
    sessionId: number,
    score: Score,
    summary: InterviewSummary,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.score.upsert({
          where: { sessionId },
          create: {
            sessionId,
            contentScore: score.contentScore,
            relevanceScore: score.relevanceScore,
            confidenceScore: score.confidenceScore,
            overallScore: score.overallScore,
            scoredAt: score.scoredAt,
          },
          update: {
            contentScore: score.contentScore,
            relevanceScore: score.relevanceScore,
            confidenceScore: score.confidenceScore,
            overallScore: score.overallScore,
            scoredAt: score.scoredAt,
          },
        });

        await tx.interviewSummary.upsert({
          where: { sessionId },
          create: {
            sessionId,
            overallFeedback: summary.overallFeedback,
            strengths: summary.strengths as unknown as Prisma.InputJsonValue,
            improvements:
              summary.improvements as unknown as Prisma.InputJsonValue,
            scoringModel: summary.scoringModel,
            promptVersion: summary.promptVersion,
            generatedAt: summary.generatedAt,
          },
          update: {
            overallFeedback: summary.overallFeedback,
            strengths: summary.strengths as unknown as Prisma.InputJsonValue,
            improvements:
              summary.improvements as unknown as Prisma.InputJsonValue,
            scoringModel: summary.scoringModel,
            promptVersion: summary.promptVersion,
            generatedAt: summary.generatedAt,
          },
        });

        await tx.interviewSession.update({
          where: { id: sessionId },
          data: {
            status: SessionStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      });

      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to save scoring result for sessionId ${sessionId}: ${(error as Error).message}`,
      );
      return err(new Error('Failed to save scoring result.'));
    }
  }

  async findSessionResult(
    sessionPublicId: string,
  ): Promise<Result<ScoringResult | null, Error>> {
    try {
      const session = await this.prisma.interviewSession.findUnique({
        where: { publicId: sessionPublicId },
        include: {
          score: true,
          interviewSummary: true,
        },
      });

      if (!session || !session.score || !session.interviewSummary) {
        return ok(null);
      }

      const score = mapScoreToDomain(session.score);
      const summary = mapSummaryToDomain(session.interviewSummary);

      return ok(new ScoringResult(score, summary, session.publicId));
    } catch (error) {
      this.logger.error(
        `Failed to find session result for '${sessionPublicId}': ${(error as Error).message}`,
      );
      return err(new Error('Failed to find session result.'));
    }
  }

  async getSessionOwnerUserId(
    sessionPublicId: string,
  ): Promise<Result<SessionOwnerInfo | null, Error>> {
    try {
      const session = await this.prisma.interviewSession.findUnique({
        where: {
          publicId: sessionPublicId,
        },
        select: {
          userId: true,
          status: true,
          user: {
            select: {
              publicId: true,
            },
          },
        },
      });

      if (!session) {
        return ok(null);
      }

      return ok({
        userId: session.userId,
        ownerPublicId: session.user.publicId,
        sessionStatus: session.status,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get session owner for '${sessionPublicId}': ${(error as Error).message}`,
      );
      return err(new Error('Failed to get session owner.'));
    }
  }
}
