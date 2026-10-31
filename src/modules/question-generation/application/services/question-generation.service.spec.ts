import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../domain/enums/question.enum';
import { QuestionSetLockedError } from '../../domain/errors/question-generation.error';
import type {
  GenerationContext,
  IQuestionGenerationRepository,
  StoredQuestion,
} from '../../domain/repositories/question-generation.repo.interface';
import type { IQuestionGenerator } from '../interfaces/question-generator.interface';
import { QuestionGenerationService } from './question-generation.service';

const parsedData: CvParsedData = {
  summary: 'Dev',
  skills: { languages: [], frameworks: [], databases: [], tools: [] },
  experiences: [],
  education: [],
  projects: [],
};

const context: GenerationContext = {
  sessionId: 7,
  status: CommonSessionStatus.CREATED,
  jobDescription: 'NestJS dev',
  parsedData,
};

const generated = [
  {
    orderIndex: 1,
    content: 'First?',
    domain: QuestionDomain.TECHNICAL,
    difficulty: QuestionDifficulty.EASY,
  },
];
const stored: StoredQuestion[] = [{ ...generated[0], publicId: 'q-1' }];

describe('QuestionGenerationService', () => {
  const getGenerationContext = jest.fn<
    ReturnType<IQuestionGenerationRepository['getGenerationContext']>,
    Parameters<IQuestionGenerationRepository['getGenerationContext']>
  >();
  const replaceQuestions = jest.fn<
    ReturnType<IQuestionGenerationRepository['replaceQuestions']>,
    Parameters<IQuestionGenerationRepository['replaceQuestions']>
  >();
  const getSessionQuestions = jest.fn<
    ReturnType<IQuestionGenerationRepository['getSessionQuestions']>,
    Parameters<IQuestionGenerationRepository['getSessionQuestions']>
  >();
  const generateAsync = jest.fn<
    ReturnType<IQuestionGenerator['generateAsync']>,
    Parameters<IQuestionGenerator['generateAsync']>
  >();
  const service = new QuestionGenerationService(
    { getGenerationContext, replaceQuestions, getSessionQuestions },
    { generateAsync },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    getGenerationContext.mockResolvedValue(ok(context));
    generateAsync.mockResolvedValue(ok(generated));
    replaceQuestions.mockResolvedValue(ok(stored));
  });

  describe('generateQuestionsAsync', () => {
    it('generates, stores and returns the questions', async () => {
      const result = await service.generateQuestionsAsync('u-1', 's-1', {
        count: 4,
      });

      expect(result._unsafeUnwrap()).toEqual({
        sessionPublicId: 's-1',
        questions: stored,
      });
      expect(getGenerationContext).toHaveBeenCalledWith('s-1', 'u-1');
      expect(generateAsync).toHaveBeenCalledWith({
        parsedData,
        jobDescription: 'NestJS dev',
        count: 4,
      });
      expect(replaceQuestions).toHaveBeenCalledWith(7, generated);
    });

    it('defaults the count to 5', async () => {
      await service.generateQuestionsAsync('u-1', 's-1', {});

      expect(generateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ count: 5 }),
      );
    });

    it('returns 404 when the session is missing or not owned', async () => {
      getGenerationContext.mockResolvedValue(ok(null));

      const error = (
        await service.generateQuestionsAsync('u-1', 's-1', {})
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.NotFound);
      expect(generateAsync).not.toHaveBeenCalled();
    });

    it.each([
      CommonSessionStatus.IN_PROGRESS,
      CommonSessionStatus.SUBMITTED,
      CommonSessionStatus.COMPLETED,
    ])('returns 409 when the session is %s', async (status) => {
      getGenerationContext.mockResolvedValue(ok({ ...context, status }));

      const error = (
        await service.generateQuestionsAsync('u-1', 's-1', {})
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.Conflict);
      expect(error.message).toBe(
        'Questions can only be generated while the session is CREATED',
      );
      expect(generateAsync).not.toHaveBeenCalled();
    });

    it('returns 409 when the CV has not been parsed', async () => {
      getGenerationContext.mockResolvedValue(
        ok({ ...context, parsedData: null }),
      );

      const error = (
        await service.generateQuestionsAsync('u-1', 's-1', {})
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.Conflict);
      expect(error.message).toBe('CV has not been parsed yet');
      expect(generateAsync).not.toHaveBeenCalled();
    });

    it('returns 500 without detail when loading the context fails', async () => {
      getGenerationContext.mockResolvedValue(err(new Error('db down')));

      const error = (
        await service.generateQuestionsAsync('u-1', 's-1', {})
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe('Failed to generate interview questions');
    });

    it('passes the generator error through and does not store anything', async () => {
      const failure = new AppError(
        ErrorCode.InternalServerError,
        'Failed to generate interview questions',
      );
      generateAsync.mockResolvedValue(err(failure));

      const result = await service.generateQuestionsAsync('u-1', 's-1', {});

      expect(result._unsafeUnwrapErr()).toBe(failure);
      expect(replaceQuestions).not.toHaveBeenCalled();
    });

    it('returns 409 when the session started while generating', async () => {
      replaceQuestions.mockResolvedValue(err(new QuestionSetLockedError()));

      const error = (
        await service.generateQuestionsAsync('u-1', 's-1', {})
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.Conflict);
    });

    it('returns 500 without detail when saving fails', async () => {
      replaceQuestions.mockResolvedValue(err(new Error('deadlock')));

      const error = (
        await service.generateQuestionsAsync('u-1', 's-1', {})
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe('Failed to generate interview questions');
    });
  });

  describe('getQuestionsAsync', () => {
    it('returns the stored questions', async () => {
      const data = { sessionPublicId: 's-1', questions: stored };
      getSessionQuestions.mockResolvedValue(ok(data));

      const result = await service.getQuestionsAsync('u-1', 's-1');

      expect(result._unsafeUnwrap()).toEqual(data);
      expect(getSessionQuestions).toHaveBeenCalledWith('s-1', 'u-1');
    });

    it('returns 404 when the session is missing or not owned', async () => {
      getSessionQuestions.mockResolvedValue(ok(null));

      const error = (
        await service.getQuestionsAsync('u-1', 's-1')
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.NotFound);
    });

    it('returns 500 without detail when the query fails', async () => {
      getSessionQuestions.mockResolvedValue(err(new Error('db down')));

      const error = (
        await service.getQuestionsAsync('u-1', 's-1')
      )._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe('Failed to retrieve interview questions');
    });
  });
});
