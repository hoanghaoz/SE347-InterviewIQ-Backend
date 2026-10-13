import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  InterviewAnswerConflictError,
  InterviewAnswerUnavailableError,
} from '../domain/errors/interview-answer.error';
import {
  IInterviewAnswerRepository,
  type AuthorizedInterviewQuestion,
  type SaveInterviewAnswerData,
  type SavedInterviewAnswer,
} from '../domain/repositories/interview-answer.repo.interface';
import { mapStatusToDomain } from './interview-mapper';

@Injectable()
export class InterviewAnswerRepository implements IInterviewAnswerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getQuestionForUser(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
  ): Promise<Result<AuthorizedInterviewQuestion | null, Error>> {
    try {
      const question = await this.prisma.question.findUnique({
        where: {
          publicId: questionPublicId,
          session: {
            publicId: sessionPublicId,
            user: { publicId: userPublicId },
          },
        },
        select: { session: { select: { status: true } } },
      });
      return ok(
        question
          ? { status: mapStatusToDomain(question.session.status) }
          : null,
      );
    } catch {
      return err(new Error('Failed to authorize interview question.'));
    }
  }

  async saveAnswer(
    data: SaveInterviewAnswerData,
  ): Promise<Result<SavedInterviewAnswer, Error>> {
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const session = await tx.interviewSession.findUnique({
          where: {
            publicId: data.sessionPublicId,
            user: { publicId: data.userPublicId },
          },
          select: { id: true, userId: true },
        });
        if (!session) throw new InterviewAnswerUnavailableError();
        // The guarded update locks this row until the answer write commits. A
        // concurrent session submission must wait, or this update matches no row.
        const locked = await tx.interviewSession.updateMany({
          where: {
            id: session.id,
            userId: session.userId,
            status: { in: [SessionStatus.CREATED, SessionStatus.IN_PROGRESS] },
          },
          data: { status: SessionStatus.IN_PROGRESS },
        });
        if (locked.count !== 1) throw new InterviewAnswerConflictError();
        const question = await tx.question.findUnique({
          where: { publicId: data.questionPublicId, sessionId: session.id },
          select: { id: true },
        });
        if (!question) throw new InterviewAnswerUnavailableError();
        const answerData = {
          videoUrl: data.videoUrl,
          transcript: data.transcript,
          durationSeconds: data.durationSeconds,
        };
        const answer = await tx.answer.upsert({
          where: { questionId: question.id },
          create: { questionId: question.id, ...answerData },
          update: answerData,
          select: { publicId: true, createdAt: true, updatedAt: true },
        });
        return { ...answer, ...answerData };
      });
      return ok(saved);
    } catch (error) {
      if (
        error instanceof InterviewAnswerConflictError ||
        error instanceof InterviewAnswerUnavailableError
      )
        return err(error);
      return err(new Error('Failed to save interview answer.'));
    }
  }
}
