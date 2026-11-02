import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import { DEFAULT_QUESTION_COUNT } from '../../domain/constants/question-generation.constants';
import { QuestionSetLockedError } from '../../domain/errors/question-generation.error';
import { IQuestionGenerationRepository } from '../../domain/repositories/question-generation.repo.interface';
import type { GenerateQuestionsRequestDto } from '../dtos/generate-questions.request.dto';
import type { SessionQuestionsResponseDto } from '../dtos/question.response.dto';
import { IQuestionGenerationService } from '../interfaces/question-generation.service.interface';
import { IQuestionGenerator } from '../interfaces/question-generator.interface';

const SESSION_NOT_FOUND_MESSAGE = 'Interview session not found or unavailable';
const NOT_CREATED_MESSAGE =
  'Questions can only be generated while the session is CREATED';

@Injectable()
export class QuestionGenerationService implements IQuestionGenerationService {
  constructor(
    private readonly questionRepo: IQuestionGenerationRepository,
    private readonly questionGenerator: IQuestionGenerator,
  ) {}

  async generateQuestionsAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: GenerateQuestionsRequestDto,
  ): Promise<Result<SessionQuestionsResponseDto, AppError>> {
    const contextResult = await this.questionRepo.getGenerationContext(
      sessionPublicId,
      userPublicId,
    );
    if (contextResult.isErr()) {
      return err(this.generationFailure());
    }
    const context = contextResult.value;
    if (!context) {
      return err(new AppError(ErrorCode.NotFound, SESSION_NOT_FOUND_MESSAGE));
    }
    if (context.status !== CommonSessionStatus.CREATED) {
      return err(new AppError(ErrorCode.Conflict, NOT_CREATED_MESSAGE));
    }
    if (!context.parsedData) {
      return err(
        new AppError(ErrorCode.Conflict, 'CV has not been parsed yet'),
      );
    }

    const generated = await this.questionGenerator.generateAsync({
      parsedData: context.parsedData,
      jobDescription: context.jobDescription,
      count: request.count ?? DEFAULT_QUESTION_COUNT,
    });
    if (generated.isErr()) {
      return err(generated.error);
    }

    const saved = await this.questionRepo.replaceQuestions(
      context.sessionId,
      generated.value,
    );
    if (saved.isErr()) {
      if (saved.error instanceof QuestionSetLockedError) {
        return err(new AppError(ErrorCode.Conflict, NOT_CREATED_MESSAGE));
      }
      return err(this.generationFailure());
    }

    return ok({ sessionPublicId, questions: saved.value });
  }

  async getQuestionsAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<SessionQuestionsResponseDto, AppError>> {
    const result = await this.questionRepo.getSessionQuestions(
      sessionPublicId,
      userPublicId,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to retrieve interview questions',
        ),
      );
    }
    if (!result.value) {
      return err(new AppError(ErrorCode.NotFound, SESSION_NOT_FOUND_MESSAGE));
    }
    return ok(result.value);
  }

  private generationFailure(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to generate interview questions',
    );
  }
}
