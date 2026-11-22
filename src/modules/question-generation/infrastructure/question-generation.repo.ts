import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import {
  QuestionDifficulty as PrismaQuestionDifficulty,
  QuestionDomain as PrismaQuestionDomain,
  SessionStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { CvParsedData } from '../../cv/domain/types/cv-parsed-data.type';
import { mapStatusToDomain } from '../../interview/infrastructure/interview-mapper';
import {
  QuestionNotInSessionError,
  QuestionSetLockedError,
} from '../domain/errors/question-generation.error';
import {
  GeneratedQuestion,
  GenerationContext,
  IQuestionGenerationRepository,
  QuestionReplacement,
  SessionQuestions,
  StoredQuestion,
} from '../domain/repositories/question-generation.repo.interface';
import {
  mapDifficultyToDomain,
  mapDifficultyToPrisma,
  mapDomainToDomain,
  mapDomainToPrisma,
} from './question-mapper';

const QUESTION_SELECT = {
  publicId: true,
  orderIndex: true,
  content: true,
  domain: true,
  difficulty: true,
} as const;

type QuestionRow = {
  publicId: string;
  orderIndex: number;
  content: string;
  domain: PrismaQuestionDomain;
  difficulty: PrismaQuestionDifficulty;
};

function toStoredQuestion(row: QuestionRow): StoredQuestion {
  return {
    publicId: row.publicId,
    orderIndex: row.orderIndex,
    content: row.content,
    domain: mapDomainToDomain(row.domain),
    difficulty: mapDifficultyToDomain(row.difficulty),
  };
}

@Injectable()
export class QuestionGenerationRepository implements IQuestionGenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getGenerationContext(
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<Result<GenerationContext | null, Error>> {
    try {
      const session = await this.prisma.interviewSession.findFirst({
        where: {
          publicId: sessionPublicId,
          user: { publicId: userPublicId },
        },
        select: {
          id: true,
          status: true,
          jobDescription: true,
          cv: { select: { parsedData: true } },
        },
      });
      if (!session) return ok(null);

      return ok({
        sessionId: session.id,
        status: mapStatusToDomain(session.status),
        jobDescription: session.jobDescription,
        parsedData: (session.cv?.parsedData ?? null) as CvParsedData | null,
      });
    } catch {
      return err(new Error('Failed to load the question generation context'));
    }
  }

  async replaceQuestions(
    sessionId: number,
    questions: GeneratedQuestion[],
  ): Promise<Result<StoredQuestion[], Error>> {
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        // Updating the session row both re-checks the status and holds the row
        // lock until commit, so a concurrent "start" cannot slip in between.
        const locked = await tx.interviewSession.updateMany({
          where: { id: sessionId, status: SessionStatus.CREATED },
          data: { totalQuestions: questions.length },
        });
        if (locked.count === 0) throw new QuestionSetLockedError();

        await tx.question.deleteMany({ where: { sessionId } });
        await tx.question.createMany({
          data: questions.map((question) => ({
            sessionId,
            orderIndex: question.orderIndex,
            content: question.content,
            domain: mapDomainToPrisma(question.domain),
            difficulty: mapDifficultyToPrisma(question.difficulty),
          })),
        });
        return tx.question.findMany({
          where: { sessionId },
          orderBy: { orderIndex: 'asc' },
          select: QUESTION_SELECT,
        });
      });
      return ok(rows.map(toStoredQuestion));
    } catch (error) {
      if (error instanceof QuestionSetLockedError) return err(error);
      return err(new Error('Failed to save the generated questions'));
    }
  }

  async replaceQuestion(
    sessionId: number,
    questionPublicId: string,
    replacement: QuestionReplacement,
  ): Promise<Result<StoredQuestion[], Error>> {
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        // Guarded no-op update: re-checks the status and holds the session row lock until
        // commit, so a concurrent "start" cannot slip in between.
        const locked = await tx.interviewSession.updateMany({
          where: { id: sessionId, status: SessionStatus.CREATED },
          data: { status: SessionStatus.CREATED },
        });
        if (locked.count === 0) throw new QuestionSetLockedError();

        const updated = await tx.question.updateMany({
          where: { publicId: questionPublicId, sessionId },
          data: {
            content: replacement.content,
            domain: mapDomainToPrisma(replacement.domain),
            difficulty: mapDifficultyToPrisma(replacement.difficulty),
          },
        });
        if (updated.count === 0) throw new QuestionNotInSessionError();

        return tx.question.findMany({
          where: { sessionId },
          orderBy: { orderIndex: 'asc' },
          select: QUESTION_SELECT,
        });
      });
      return ok(rows.map(toStoredQuestion));
    } catch (error) {
      if (
        error instanceof QuestionSetLockedError ||
        error instanceof QuestionNotInSessionError
      ) {
        return err(error);
      }
      return err(new Error('Failed to save the regenerated question'));
    }
  }

  async getSessionQuestions(
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<Result<SessionQuestions | null, Error>> {
    try {
      const session = await this.prisma.interviewSession.findFirst({
        where: {
          publicId: sessionPublicId,
          user: { publicId: userPublicId },
        },
        select: {
          publicId: true,
          questions: {
            orderBy: { orderIndex: 'asc' },
            select: QUESTION_SELECT,
          },
        },
      });
      if (!session) return ok(null);

      return ok({
        sessionPublicId: session.publicId,
        questions: session.questions.map(toStoredQuestion),
      });
    } catch {
      return err(new Error('Failed to load the session questions'));
    }
  }
}
