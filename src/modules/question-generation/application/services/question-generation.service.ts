import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import { DEFAULT_QUESTION_COUNT } from '../../domain/constants/question-generation.constants';
import {
  QuestionNotInSessionError,
  QuestionSetLockedError,
} from '../../domain/errors/question-generation.error';
import { IQuestionGenerationRepository } from '../../domain/repositories/question-generation.repo.interface';
import type { GenerateQuestionsRequestDto } from '../dtos/generate-questions.request.dto';
import type { RegenerateQuestionRequestDto } from '../dtos/regenerate-question.request.dto';
import type { SessionQuestionsResponseDto } from '../dtos/question.response.dto';
import { IQuestionGenerationService } from '../interfaces/question-generation.service.interface';
import { IQuestionGenerator } from '../interfaces/question-generator.interface';

const SESSION_NOT_FOUND_MESSAGE = 'Interview session not found or unavailable';
const QUESTION_NOT_FOUND_MESSAGE =
  'Interview question not found or unavailable';
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
      domain: request.domain,
      difficulty: request.difficulty,
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

  async regenerateQuestionAsync(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
    request: RegenerateQuestionRequestDto,
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

    const setResult = await this.questionRepo.getSessionQuestions(
      sessionPublicId,
      userPublicId,
    );
    if (setResult.isErr()) {
      return err(this.generationFailure());
    }
    if (!setResult.value) {
      return err(new AppError(ErrorCode.NotFound, SESSION_NOT_FOUND_MESSAGE));
    }
    const questions = setResult.value.questions;
    const target = questions.find(
      (question) => question.publicId === questionPublicId,
    );
    if (!target) {
      return err(new AppError(ErrorCode.NotFound, QUESTION_NOT_FOUND_MESSAGE));
    }

    // Keep the shape of the set unless the caller asks otherwise, and make the new question
    // differ from every current one, the replaced one included.
    const generated = await this.questionGenerator.generateAsync({
      parsedData: context.parsedData,
      jobDescription: context.jobDescription,
      count: 1,
      domain: request.domain ?? target.domain,
      difficulty: request.difficulty ?? target.difficulty,
      exclude: questions.map((question) => question.content),
    });
    if (generated.isErr()) {
      return err(generated.error);
    }
    const [next] = generated.value;

    const saved = await this.questionRepo.replaceQuestion(
      context.sessionId,
      questionPublicId,
      {
        content: next.content,
        domain: next.domain,
        difficulty: next.difficulty,
      },
    );
    if (saved.isErr()) {
      if (saved.error instanceof QuestionSetLockedError) {
        return err(new AppError(ErrorCode.Conflict, NOT_CREATED_MESSAGE));
      }
      if (saved.error instanceof QuestionNotInSessionError) {
        return err(
          new AppError(ErrorCode.NotFound, QUESTION_NOT_FOUND_MESSAGE),
        );
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
