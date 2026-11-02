import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import type { GeneratedQuestion } from '../../domain/repositories/question-generation.repo.interface';

export type QuestionGenerationInput = {
  parsedData: CvParsedData;
  jobDescription: string | null;
  count: number;
};

export abstract class IQuestionGenerator {
  abstract generateAsync(
    input: QuestionGenerationInput,
  ): Promise<Result<GeneratedQuestion[], AppError>>;
}
