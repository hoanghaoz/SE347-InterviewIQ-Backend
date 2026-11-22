import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';
import { QuestionSetLockedError } from '../../../question-generation/domain/errors/question-generation.error';
import type { IQuestionGenerationRepository } from '../../../question-generation/domain/repositories/question-generation.repo.interface';
import { MAX_BANK_ITEMS_PER_USER } from '../../domain/constants/question-bank.constants';
import {
  QuestionBankFullError,
  QuestionBankUnavailableError,
} from '../../domain/errors/question-bank.error';
import { hashQuestionContent } from '../../domain/question-content';
import { IQuestionBankRepository } from '../../domain/repositories/question-bank.repo.interface';
import {
  QuestionBankQueryDto,
  SaveQuestionBankRequestDto,
  UseBankQuestionsRequestDto,
} from '../dtos/question-bank.request.dto';
import { QuestionBankService } from './question-bank.service';

describe('QuestionBankService', () => {
  const listItems = jest.fn<
    ReturnType<IQuestionBankRepository['listItems']>,
    Parameters<IQuestionBankRepository['listItems']>
  >();
  const getItemsByPublicIds = jest.fn<
    ReturnType<IQuestionBankRepository['getItemsByPublicIds']>,
    Parameters<IQuestionBankRepository['getItemsByPublicIds']>
  >();
  const getGenerationContext = jest.fn<
    ReturnType<IQuestionGenerationRepository['getGenerationContext']>,
    Parameters<IQuestionGenerationRepository['getGenerationContext']>
  >();
  const replaceQuestions = jest.fn<
    ReturnType<IQuestionGenerationRepository['replaceQuestions']>,
    Parameters<IQuestionGenerationRepository['replaceQuestions']>
  >();
  const getSessionQuestions = jest.fn<
    ReturnType<IQuestionBankRepository['getSessionQuestions']>,
    Parameters<IQuestionBankRepository['getSessionQuestions']>
  >();
  const addItems = jest.fn<
    ReturnType<IQuestionBankRepository['addItems']>,
    Parameters<IQuestionBankRepository['addItems']>
  >();
  const deleteItem = jest.fn<
    ReturnType<IQuestionBankRepository['deleteItem']>,
    Parameters<IQuestionBankRepository['deleteItem']>
  >();
  const service = new QuestionBankService(
    {
      listItems,
      getItemsByPublicIds,
      getSessionQuestions,
      addItems,
      deleteItem,
    },
    {
      getGenerationContext,
      replaceQuestions,
      replaceQuestion: jest.fn(),
      getSessionQuestions: jest.fn(),
    },
  );
  const userId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const row = {
    publicId: '00000000-0000-4000-8000-000000000010',
    content: 'Explain the difference between a process and a thread.',
    domain: QuestionDomain.TECHNICAL,
    difficulty: QuestionDifficulty.MEDIUM,
    createdAt: new Date('2026-11-22T07:58:11.000Z'),
  };
  const query = (override: Partial<QuestionBankQueryDto> = {}) =>
    Object.assign(new QuestionBankQueryDto(), override);

  beforeEach(() => {
    jest.resetAllMocks();
    listItems.mockResolvedValue(ok({ items: [row], totalItems: 45 }));
  });

  describe('listAsync', () => {
    it('maps rows to the response shape and builds the page metadata', async () => {
      const result = await service.listAsync(
        userId,
        query({ pageNumber: 2, pageSize: 20 }),
      );
      if (result.isErr()) throw result.error;
      expect(result.value.items).toEqual([
        {
          id: row.publicId,
          content: row.content,
          domain: 'TECHNICAL',
          difficulty: 'MEDIUM',
          createdAt: '2026-11-22T07:58:11.000Z',
        },
      ]);
      expect(result.value).toMatchObject({
        totalPages: 3,
        currentPage: 2,
        pageNumber: 2,
        pageSize: 20,
        hasPrevious: true,
        hasNext: true,
      });
    });

    it('never exposes the internal id or the content hash', async () => {
      const result = await service.listAsync(userId, query());
      if (result.isErr()) throw result.error;
      expect(Object.keys(result.value.items[0]).sort()).toEqual([
        'content',
        'createdAt',
        'difficulty',
        'domain',
        'id',
      ]);
    });

    it('scopes the query to the caller and forwards pagination and filters', async () => {
      await service.listAsync(
        userId,
        query({
          pageNumber: 3,
          pageSize: 10,
          domain: QuestionDomain.BEHAVIORAL,
          difficulty: QuestionDifficulty.HARD,
          search: 'team',
        }),
      );
      expect(listItems).toHaveBeenCalledWith(
        userId,
        { pageNumber: 3, pageSize: 10 },
        {
          domain: QuestionDomain.BEHAVIORAL,
          difficulty: QuestionDifficulty.HARD,
          search: 'team',
        },
      );
    });

    it('treats a blank search as no search', async () => {
      await service.listAsync(userId, query({ search: '' }));
      expect(listItems).toHaveBeenCalledWith(
        userId,
        expect.anything(),
        expect.objectContaining({ search: undefined }),
      );
    });

    it('returns an empty page when the bank has no matches', async () => {
      listItems.mockResolvedValue(ok({ items: [], totalItems: 0 }));
      const result = await service.listAsync(userId, query());
      if (result.isErr()) throw result.error;
      expect(result.value).toMatchObject({
        items: [],
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      });
    });

    it('sanitizes repository failures', async () => {
      listItems.mockResolvedValue(err(new Error('database secret')));
      const result = await service.listAsync(userId, query());
      if (result.isOk()) throw new Error('Expected failure');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
    });
  });

  describe('saveFromSessionAsync', () => {
    const q = (n: number, content: string) => ({
      publicId: `00000000-0000-4000-8000-0000000001${n}0`,
      content,
      domain: QuestionDomain.TECHNICAL,
      difficulty: QuestionDifficulty.EASY,
    });
    const questions = [
      q(1, 'What is a thread?'),
      q(2, 'What is a process?'),
      q(3, 'What is a deadlock?'),
    ];
    const request = (override: Partial<SaveQuestionBankRequestDto> = {}) =>
      Object.assign(new SaveQuestionBankRequestDto(), {
        sessionPublicId: sessionId,
        ...override,
      });

    beforeEach(() => {
      getSessionQuestions.mockResolvedValue(ok(questions));
      addItems.mockResolvedValue(ok({ savedCount: 3, skippedCount: 0 }));
    });

    it('saves every question of the session with its content hash and the per-user limit', async () => {
      const result = await service.saveFromSessionAsync(userId, request());
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ savedCount: 3, skippedCount: 0 });
      expect(getSessionQuestions).toHaveBeenCalledWith(userId, sessionId);
      expect(addItems).toHaveBeenCalledWith(
        userId,
        questions.map((question) => ({
          content: question.content,
          contentHash: hashQuestionContent(question.content),
          domain: question.domain,
          difficulty: question.difficulty,
        })),
        MAX_BANK_ITEMS_PER_USER,
      );
    });

    it('saves only the selected questions', async () => {
      await service.saveFromSessionAsync(
        userId,
        request({ questionPublicIds: [questions[1].publicId] }),
      );
      expect(addItems).toHaveBeenCalledWith(
        userId,
        [expect.objectContaining({ content: 'What is a process?' })],
        MAX_BANK_ITEMS_PER_USER,
      );
    });

    it('gives texts that differ only in case and spacing the same hash', async () => {
      getSessionQuestions.mockResolvedValue(
        ok([q(1, 'What is a Thread?'), q(2, '  what is   a thread? ')]),
      );
      await service.saveFromSessionAsync(userId, request());
      const [, items] = addItems.mock.calls[0];
      expect(items[0].contentHash).toBe(items[1].contentHash);
    });

    it('rejects the whole request when a selected question is not in the session', async () => {
      const result = await service.saveFromSessionAsync(
        userId,
        request({
          questionPublicIds: [
            questions[0].publicId,
            '00000000-0000-4000-8000-0000000000ff',
          ],
        }),
      );
      if (result.isOk()) throw new Error('Expected not found');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(addItems).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing or foreign session', async () => {
      getSessionQuestions.mockResolvedValue(ok(null));
      const result = await service.saveFromSessionAsync(userId, request());
      if (result.isOk()) throw new Error('Expected not found');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(addItems).not.toHaveBeenCalled();
    });

    it('rejects a session without questions', async () => {
      getSessionQuestions.mockResolvedValue(ok([]));
      const result = await service.saveFromSessionAsync(userId, request());
      if (result.isOk()) throw new Error('Expected bad request');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(addItems).not.toHaveBeenCalled();
    });

    it('reports how many questions were skipped as duplicates', async () => {
      addItems.mockResolvedValue(ok({ savedCount: 1, skippedCount: 2 }));
      const result = await service.saveFromSessionAsync(userId, request());
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ savedCount: 1, skippedCount: 2 });
    });

    it('maps a full bank to 409 and an unavailable user to 404', async () => {
      addItems.mockResolvedValueOnce(
        err(new QuestionBankFullError(MAX_BANK_ITEMS_PER_USER)),
      );
      const full = await service.saveFromSessionAsync(userId, request());
      if (full.isOk()) throw new Error('Expected conflict');
      expect(full.error.code).toBe(ErrorCode.Conflict);
      expect(full.error.message).toContain(String(MAX_BANK_ITEMS_PER_USER));

      addItems.mockResolvedValueOnce(err(new QuestionBankUnavailableError()));
      const gone = await service.saveFromSessionAsync(userId, request());
      if (gone.isOk()) throw new Error('Expected not found');
      expect(gone.error.code).toBe(ErrorCode.NotFound);
    });

    it.each(['load', 'save'])(
      'sanitizes a repository failure on %s',
      async (step) => {
        if (step === 'load') {
          getSessionQuestions.mockResolvedValue(
            err(new Error('database secret')),
          );
        } else {
          addItems.mockResolvedValue(err(new Error('database secret')));
        }
        const result = await service.saveFromSessionAsync(userId, request());
        if (result.isOk()) throw new Error('Expected failure');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('database secret');
      },
    );
  });

  describe('deleteAsync', () => {
    it('deletes within the callers scope', async () => {
      deleteItem.mockResolvedValue(ok(undefined));
      const result = await service.deleteAsync(userId, row.publicId);
      expect(result.isOk()).toBe(true);
      expect(deleteItem).toHaveBeenCalledWith(userId, row.publicId);
    });

    it('sanitizes repository failures', async () => {
      deleteItem.mockResolvedValue(err(new Error('database secret')));
      const result = await service.deleteAsync(userId, row.publicId);
      if (result.isOk()) throw new Error('Expected failure');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
    });
  });
  describe('useInSessionAsync', () => {
    const itemIds = [
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3',
    ];
    const bankItem = (
      id: string,
      content: string,
      domain = QuestionDomain.TECHNICAL,
    ) => ({
      publicId: id,
      content,
      domain,
      difficulty: QuestionDifficulty.EASY,
      createdAt: new Date('2026-11-22T07:58:11.000Z'),
    });
    const stored = [
      {
        publicId: 'q-1',
        orderIndex: 1,
        content: 'C',
        domain: QuestionDomain.TECHNICAL,
        difficulty: QuestionDifficulty.EASY,
      },
    ];
    const useItems = (ids = itemIds) =>
      service.useInSessionAsync(
        userId,
        sessionId,
        Object.assign(new UseBankQuestionsRequestDto(), { itemPublicIds: ids }),
      );

    beforeEach(() => {
      getGenerationContext.mockResolvedValue(
        ok({
          sessionId: 7,
          status: CommonSessionStatus.CREATED,
          jobDescription: null,
          parsedData: null,
        }),
      );
      // Cố ý trả lộn thứ tự: service phải sắp theo thứ tự người dùng chọn.
      getItemsByPublicIds.mockResolvedValue(
        ok([
          bankItem(itemIds[2], 'C', QuestionDomain.SITUATIONAL),
          bankItem(itemIds[0], 'A'),
          bankItem(itemIds[1], 'B', QuestionDomain.BEHAVIORAL),
        ]),
      );
      replaceQuestions.mockResolvedValue(ok(stored));
    });

    it('replaces the session set with the chosen items in the chosen order', async () => {
      const result = await useItems();

      expect(result._unsafeUnwrap()).toEqual({
        sessionPublicId: sessionId,
        questions: stored,
      });
      expect(getGenerationContext).toHaveBeenCalledWith(sessionId, userId);
      expect(getItemsByPublicIds).toHaveBeenCalledWith(userId, itemIds);
      expect(replaceQuestions).toHaveBeenCalledWith(7, [
        {
          orderIndex: 1,
          content: 'A',
          domain: 'TECHNICAL',
          difficulty: 'EASY',
        },
        {
          orderIndex: 2,
          content: 'B',
          domain: 'BEHAVIORAL',
          difficulty: 'EASY',
        },
        {
          orderIndex: 3,
          content: 'C',
          domain: 'SITUATIONAL',
          difficulty: 'EASY',
        },
      ]);
    });

    it('follows the order of the request, not the order the database returns', async () => {
      await useItems([itemIds[2], itemIds[1], itemIds[0]]);

      expect(replaceQuestions).toHaveBeenCalledWith(7, [
        expect.objectContaining({ orderIndex: 1, content: 'C' }),
        expect.objectContaining({ orderIndex: 2, content: 'B' }),
        expect.objectContaining({ orderIndex: 3, content: 'A' }),
      ]);
    });

    it('returns 404 for a missing or foreign session and reads nothing from the bank', async () => {
      getGenerationContext.mockResolvedValue(ok(null));

      const error = (await useItems())._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.NotFound);
      expect(getItemsByPublicIds).not.toHaveBeenCalled();
    });

    it.each([
      CommonSessionStatus.IN_PROGRESS,
      CommonSessionStatus.SUBMITTED,
      CommonSessionStatus.COMPLETED,
    ])('returns 409 when the session is %s', async (status) => {
      getGenerationContext.mockResolvedValue(
        ok({ sessionId: 7, status, jobDescription: null, parsedData: null }),
      );

      const error = (await useItems())._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.Conflict);
      expect(replaceQuestions).not.toHaveBeenCalled();
    });

    it('returns 404 and changes nothing when an item is not in the callers bank', async () => {
      getItemsByPublicIds.mockResolvedValue(
        ok([bankItem(itemIds[0], 'A'), bankItem(itemIds[1], 'B')]),
      );

      const error = (await useItems())._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.NotFound);
      expect(error.message).toBe('Question bank item not found');
      expect(replaceQuestions).not.toHaveBeenCalled();
    });

    it('returns 409 when the session leaves CREATED while saving', async () => {
      replaceQuestions.mockResolvedValue(err(new QuestionSetLockedError()));

      const error = (await useItems())._unsafeUnwrapErr();

      expect(error.code).toBe(ErrorCode.Conflict);
    });

    it.each(['context', 'items', 'save'])(
      'sanitizes a repository failure while loading the %s',
      async (step) => {
        if (step === 'context') {
          getGenerationContext.mockResolvedValue(
            err(new Error('database secret')),
          );
        } else if (step === 'items') {
          getItemsByPublicIds.mockResolvedValue(
            err(new Error('database secret')),
          );
        } else {
          replaceQuestions.mockResolvedValue(err(new Error('database secret')));
        }

        const error = (await useItems())._unsafeUnwrapErr();

        expect(error.code).toBe(ErrorCode.InternalServerError);
        expect(error.message).not.toContain('database secret');
      },
    );
  });
});
