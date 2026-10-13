import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  InterviewAnswerConflictError,
  InterviewAnswerUnavailableError,
} from '../domain/errors/interview-answer.error';
import { InterviewAnswerRepository } from './interview-answer.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('InterviewAnswerRepository', () => {
  const findQuestion = jest.fn();
  const findSession = jest.fn();
  const updateSession = jest.fn();
  const upsert = jest.fn();
  const tx = {
    question: { findUnique: findQuestion },
    interviewSession: { findUnique: findSession, updateMany: updateSession },
    answer: { upsert },
  };
  const transaction = jest.fn<
    Promise<unknown>,
    [(client: typeof tx) => Promise<unknown>]
  >();
  const repository = new InterviewAnswerRepository({
    question: { findUnique: findQuestion },
    $transaction: transaction,
  } as unknown as PrismaService);
  const data = {
    userPublicId: 'user',
    sessionPublicId: 'session',
    questionPublicId: 'question',
    videoUrl: 'https://example.com/video.webm',
    transcript: 'My answer',
    durationSeconds: 13,
  };
  const row = {
    publicId: 'answer-id',
    createdAt: new Date('2026-10-12T10:00:00Z'),
    updatedAt: new Date('2026-10-12T10:00:00Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation((callback) => callback(tx));
    findSession.mockResolvedValue({ id: 10, userId: 20 });
    findQuestion.mockResolvedValue({
      id: 30,
      session: { status: 'IN_PROGRESS' },
    });
    updateSession.mockResolvedValue({ count: 1 });
    upsert.mockResolvedValue(row);
  });

  it('checks question/session/user public IDs together', async () => {
    const result = await repository.getQuestionForUser(
      'user',
      'session',
      'question',
    );
    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({ status: 'IN_PROGRESS' });
    expect(findQuestion).toHaveBeenCalledWith({
      where: {
        publicId: 'question',
        session: { publicId: 'session', user: { publicId: 'user' } },
      },
      select: { session: { select: { status: true } } },
    });
  });

  it('returns null for a missing or mismatched question', async () => {
    findQuestion.mockResolvedValue(null);
    const result = await repository.getQuestionForUser(
      'user',
      'session',
      'question',
    );
    if (result.isErr()) throw result.error;
    expect(result.value).toBeNull();
  });

  it('sanitizes authorization database errors', async () => {
    findQuestion.mockRejectedValue(new Error('database secret'));
    const result = await repository.getQuestionForUser(
      'user',
      'session',
      'question',
    );
    if (result.isOk()) throw new Error('Expected repository failure');
    expect(result.error.message).not.toContain('database secret');
  });

  it('locks and guards the owned session before upserting the question answer', async () => {
    const result = await repository.saveAnswer(data);
    if (result.isErr()) throw result.error;
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(findSession).toHaveBeenCalledWith({
      where: { publicId: 'session', user: { publicId: 'user' } },
      select: { id: true, userId: true },
    });
    expect(updateSession).toHaveBeenCalledWith({
      where: { id: 10, userId: 20, status: { in: ['CREATED', 'IN_PROGRESS'] } },
      data: { status: 'IN_PROGRESS' },
    });
    expect(findQuestion).toHaveBeenCalledWith({
      where: { publicId: 'question', sessionId: 10 },
      select: { id: true },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { questionId: 30 },
      create: {
        questionId: 30,
        videoUrl: data.videoUrl,
        transcript: data.transcript,
        durationSeconds: 13,
      },
      update: {
        videoUrl: data.videoUrl,
        transcript: data.transcript,
        durationSeconds: 13,
      },
      select: { publicId: true, createdAt: true, updatedAt: true },
    });
    expect(updateSession.mock.invocationCallOrder[0]).toBeLessThan(
      upsert.mock.invocationCallOrder[0],
    );
    expect(result.value).toEqual({
      ...row,
      videoUrl: data.videoUrl,
      transcript: 'My answer',
      durationSeconds: 13,
    });
  });

  it('retries use the same unique question key and preserve the answer public ID', async () => {
    const first = await repository.saveAnswer(data);
    const second = await repository.saveAnswer({
      ...data,
      transcript: 'Corrected answer',
    });
    if (first.isErr()) throw first.error;
    if (second.isErr()) throw second.error;
    expect(second.value.publicId).toBe(first.value.publicId);
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { questionId: 30 } }),
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { questionId: 30 },
        update: expect.objectContaining({
          transcript: 'Corrected answer',
        }) as unknown,
      }),
    );
  });

  it('rejects a session submitted after the initial authorization', async () => {
    updateSession.mockResolvedValue({ count: 0 });
    const result = await repository.saveAnswer(data);
    if (result.isOk()) throw new Error('Expected conflict');
    expect(result.error).toBeInstanceOf(InterviewAnswerConflictError);
    expect(upsert).not.toHaveBeenCalled();
    expect(findQuestion).not.toHaveBeenCalled();
  });

  it.each(['session', 'question'])(
    'rolls back the transaction on an unavailable %s',
    async (source) => {
      if (source === 'session') findSession.mockResolvedValue(null);
      else findQuestion.mockResolvedValue(null);
      const result = await repository.saveAnswer(data);
      if (result.isOk()) throw new Error('Expected unavailable question');
      expect(result.error).toBeInstanceOf(InterviewAnswerUnavailableError);
      await expect(transaction.mock.results[0].value).rejects.toBeInstanceOf(
        InterviewAnswerUnavailableError,
      );
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('sanitizes write/transaction failures', async () => {
    upsert.mockRejectedValue(new Error('database secret'));
    const result = await repository.saveAnswer(data);
    if (result.isOk()) throw new Error('Expected repository failure');
    expect(result.error.message).toBe('Failed to save interview answer.');
    await expect(transaction.mock.results[0].value).rejects.toThrow(
      'database secret',
    );
  });
});
