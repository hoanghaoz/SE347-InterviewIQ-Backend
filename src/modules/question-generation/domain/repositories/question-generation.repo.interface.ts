import type { Result } from 'neverthrow';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import type { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import type {
  QuestionDifficulty,
  QuestionDomain,
} from '../enums/question.enum';

export type GeneratedQuestion = {
  orderIndex: number;
  content: string;
  domain: QuestionDomain;
  difficulty: QuestionDifficulty;
};

export type StoredQuestion = GeneratedQuestion & {
  publicId: string;
};

export type GenerationContext = {
  sessionId: number;
  status: CommonSessionStatus;
  jobDescription: string | null;
  // null when the session has no CV or the CV has not been parsed yet.
  parsedData: CvParsedData | null;
};

export type SessionQuestions = {
  sessionPublicId: string;
  questions: StoredQuestion[];
};

export abstract class IQuestionGenerationRepository {
  // Resolves to null when the session does not exist or is not owned by the user.
  abstract getGenerationContext(
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<Result<GenerationContext | null, Error>>;

  // Replaces the whole question set in one transaction. Fails with
  // QuestionSetLockedError when the session has left the CREATED state.
  abstract replaceQuestions(
    sessionId: number,
    questions: GeneratedQuestion[],
  ): Promise<Result<StoredQuestion[], Error>>;

  // Resolves to null when the session does not exist or is not owned by the user.
  abstract getSessionQuestions(
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<Result<SessionQuestions | null, Error>>;
}
