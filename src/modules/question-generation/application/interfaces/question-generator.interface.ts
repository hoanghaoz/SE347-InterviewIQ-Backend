import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import type {
  QuestionDifficulty,
  QuestionDomain,
} from '../../domain/enums/question.enum';
import type { GeneratedQuestion } from '../../domain/repositories/question-generation.repo.interface';

export type QuestionGenerationInput = {
  parsedData: CvParsedData;
  jobDescription: string | null;
  count: number;
  // When set, every generated question must have this domain / difficulty.
  domain?: QuestionDomain;
  difficulty?: QuestionDifficulty;
  // Questions the new ones must not repeat (used when regenerating a single question).
  exclude?: readonly string[];
};

export abstract class IQuestionGenerator {
  abstract generateAsync(
    input: QuestionGenerationInput,
  ): Promise<Result<GeneratedQuestion[], AppError>>;
}
