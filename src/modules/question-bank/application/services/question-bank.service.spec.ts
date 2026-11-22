import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';
import { IQuestionBankRepository } from '../../domain/repositories/question-bank.repo.interface';
import { QuestionBankQueryDto } from '../dtos/question-bank.request.dto';
import { QuestionBankService } from './question-bank.service';

describe('QuestionBankService', () => {
  const listItems = jest.fn<
    ReturnType<IQuestionBankRepository['listItems']>,
    Parameters<IQuestionBankRepository['listItems']>
  >();
  const service = new QuestionBankService({ listItems });
  const userId = '00000000-0000-4000-8000-000000000001';
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
    expect(result.value.items[0]).not.toHaveProperty('contentHash');
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
