import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { err, ok, type Result } from 'neverthrow';
import { Interview } from '../domain/entities/interview.entity';
import {
  IInterviewRepository,
  InterviewSessionAuthorizeResult,
  SubmitInterviewSessionData,
} from '../domain/repositories/interview.repo.interface';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { mapStatusToPrisma } from './interview-mapper';
import { InterviewSubmissionConflictError } from '../domain/errors/interview-domain.error';

@Injectable()
export class InterviewRepository implements IInterviewRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async submitInterviewSession(
    sessionPublicId: string,
    data: SubmitInterviewSessionData,
  ): Promise<Result<undefined, Error>> {
    try {
      await this.prismaService.interviewSession.update({
        where: {
          publicId: sessionPublicId,
          status: {
            in: [
              SessionStatus.CREATED,
              SessionStatus.IN_PROGRESS,
              SessionStatus.SUBMITTED,
            ],
          },
        },
        data: {
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
    cvPublicId: string,
  ): Promise<Result<InterviewSessionAuthorizeResult | null, Error>> {
    try {
      const result = await this.prismaService.interviewSession.findUnique({
        where: {
          publicId: sessionPublicId,
          user: {
            publicId: userPublicId,
          },
          cv: {
            publicId: cvPublicId,
          },
        },
        select: {
          id: true,
          cvId: true,
          userId: true,
        },
      });
      if (!result) return ok(null);
      return ok({
        sessionId: result.id,
        cvId: result.cvId,
        userId: result.userId,
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
