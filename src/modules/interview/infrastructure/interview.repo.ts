import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { err, ok, type Result } from 'neverthrow';
import { Interview } from '../domain/entities/interview.entity';
import {
  IInterviewRepository,
  InterviewSessionAuthorizeResult,
  InterviewSessionData,
  SubmitInterviewSessionData,
} from '../domain/repositories/interview.repo.interface';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { mapStatusToDomain, mapStatusToPrisma } from './interview-mapper';
import {
  InterviewStartConflictError,
  InterviewSubmissionConflictError,
} from '../domain/errors/interview-domain.error';
import {
  PageResult,
  PaginationRequest,
} from '../../../shared/common/pagination';

@Injectable()
export class InterviewRepository implements IInterviewRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async getInterviewSessions(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<InterviewSessionData>, Error>> {
    try {
      const { pageNumber, pageSize } = pagination;
      const where = { user: { publicId: userPublicId } };
      const [sessions, totalItems] = await Promise.all([
        this.prismaService.interviewSession.findMany({
          where,
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            publicId: true,
            cv: { select: { publicId: true } },
            title: true,
            status: true,
            jobDescription: true,
            totalQuestions: true,
            createdAt: true,
          },
        }),
        this.prismaService.interviewSession.count({ where }),
      ]);
      const items = sessions.map((session) => ({
        sessionPublicId: session.publicId,
        cvPublicId: session.cv?.publicId ?? null,
        title: session.title,
        status: mapStatusToDomain(session.status),
        totalQuestion: session.totalQuestions,
        jobDescription: session.jobDescription,
        createdAt: session.createdAt,
      }));
      return ok(
        new PageResult(items, totalItems, pageNumber, pageNumber, pageSize),
      );
    } catch {
      return err(new Error('Failed to get user interview session list'));
    }
  }
  async startInterviewSession(
    userId: number,
    sessionId: number,
    startedAt: Date,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.interviewSession.update({
        where: {
          id: sessionId,
          userId: userId,
          status: SessionStatus.CREATED,
        },
        data: {
          status: SessionStatus.IN_PROGRESS,
          startedAt: startedAt,
        },
      });
      return ok(undefined);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return err(new InterviewStartConflictError());
      }
      return err(new Error('Failed to start the interview session'));
    }
  }

  async submitInterviewSession(
    sessionPublicId: string,
    data: SubmitInterviewSessionData,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.interviewSession.update({
        where: {
          publicId: sessionPublicId,
          status: {
            in: [SessionStatus.IN_PROGRESS],
          },
        },
        data: {
          cvSnapshot: data.cvSnapshot,
          totalQuestions: data.totalQuestions,
          durationSeconds: data.durationSeconds,
          submittedAt: data.submittedAt,
          status: SessionStatus.SUBMITTED,
        },
        select: { publicId: true },
      });
      return ok(undefined);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return err(new InterviewSubmissionConflictError());
      }
      return err(new Error('Failed to submit interview session.'));
    }
  }

  async authorizeInterviewSession(
    sessionPublicId: string,
    userPublicId: string,
    cvPublicId?: string,
  ): Promise<Result<InterviewSessionAuthorizeResult | null, Error>> {
    try {
      const result = await this.prismaService.interviewSession.findUnique({
        where: {
          publicId: sessionPublicId,
          user: {
            publicId: userPublicId,
          },
          ...(cvPublicId !== undefined ? { cv: { publicId: cvPublicId } } : {}),
        },
        select: {
          id: true,
          cvId: true,
          userId: true,
          status: true,
        },
      });
      if (!result) return ok(null);
      return ok({
        sessionId: result.id,
        cvId: result.cvId,
        userId: result.userId,
        status: mapStatusToDomain(result.status),
      });
    } catch {
      return err(new Error('Failed to authorize user interview session'));
    }
  }

  async createInterviewSession(
    newSession: Interview,
  ): Promise<Result<string, Error>> {
    try {
      const session = await this.prismaService.interviewSession.create({
        data: {
          title: newSession.title,
          jobDescription: newSession.jobDescription,
          status: mapStatusToPrisma(newSession.status),
          userId: newSession.userId,
          cvId: newSession.cvId,
        },
        select: { publicId: true },
      });

      return ok(session.publicId);
    } catch {
      return err(new Error('Failed to create interview session.'));
    }
  }
}
