import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { InterviewSubmissionConflictError } from '../domain/errors/interview-domain.error';
import { Interview } from '../domain/entities/interview.entity';
import { CommonSessionStatus } from '../domain/enums/interview-enum';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { InterviewRepository } from './interview.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('InterviewRepository', () => {
  const create = jest.fn();
  const update = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    interviewSession: { create, update, findUnique },
  } as unknown as PrismaService;
  const repository = new InterviewRepository(prisma);

  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    findUnique.mockReset();
  });

  it('returns the publicId from the newly created session', async () => {
    const interview = Interview.create({
      userId: 1,
      cvId: 2,
      title: 'Backend interview',
      jobDescription: null,
    });
    if (interview.isErr()) throw interview.error;
    expect(interview.value.status).toBe(CommonSessionStatus.CREATED);

    create.mockResolvedValue({ publicId: 'session-public-id' });

    const result = await repository.createInterviewSession(interview.value);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toBe('session-public-id');
    expect(create).toHaveBeenCalledWith({
      data: {
        title: 'Backend interview',
        jobDescription: null,
        status: 'CREATED',
        userId: 1,
        cvId: 2,
      },
      select: { publicId: true },
    });
  });

  it('returns a safe error when Prisma rejects the write', async () => {
    const interview = Interview.create({
      userId: 1,
      cvId: 2,
      title: 'Backend interview',
      jobDescription: null,
    });
    if (interview.isErr()) throw interview.error;

    create.mockRejectedValue(new Error('database secret'));

    const result = await repository.createInterviewSession(interview.value);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected repository error');
    expect(result.error.message).toBe('Failed to create interview session.');
  });

  describe('authorizeInterviewSession', () => {
    it('requires the session, user, and CV public IDs to match', async () => {
      findUnique.mockResolvedValue({ id: 3, userId: 1, cvId: 2 });
      const result = await repository.authorizeInterviewSession(
        'session',
        'user',
        'cv',
      );
      expect(result.isOk()).toBe(true);
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ sessionId: 3, userId: 1, cvId: 2 });
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          publicId: 'session',
          user: { publicId: 'user' },
          cv: { publicId: 'cv' },
        },
        select: { id: true, cvId: true, userId: true },
      });
    });

    it('returns null for an unavailable session', async () => {
      findUnique.mockResolvedValue(null);
      expect(
        await repository.authorizeInterviewSession('session', 'user', 'cv'),
      ).toEqual({ value: null });
    });

    it('sanitizes authorization failures', async () => {
      findUnique.mockRejectedValue(new Error('database secret'));
      const result = await repository.authorizeInterviewSession(
        'session',
        'user',
        'cv',
      );
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected authorization error');
      expect(result.error.message).not.toContain('database secret');
    });
  });

  describe('submitInterviewSession', () => {
    const data = {
      totalQuestions: 7,
      durationSeconds: 0,
      submittedAt: new Date('2026-10-12T10:00:00.000Z'),
    };

    it('saves supplied metrics and timestamp as SUBMITTED with an allowed-state guard', async () => {
      update.mockResolvedValue({ publicId: 'session-public-id' });
      const result = await repository.submitInterviewSession(
        'session-public-id',
        data,
      );
      expect(result.isOk()).toBe(true);
      if (result.isErr()) throw result.error;
      expect(result.value).toBeUndefined();
      expect(update).toHaveBeenCalledWith({
        where: {
          publicId: 'session-public-id',
          status: { in: ['CREATED', 'IN_PROGRESS', 'SUBMITTED'] },
        },
        data: {
          totalQuestions: 7,
          durationSeconds: 0,
          submittedAt: new Date('2026-10-12T10:00:00.000Z'),
          status: 'SUBMITTED',
        },
        select: { publicId: true },
      });
    });

    it('translates a no-match error to a submission conflict', async () => {
      update.mockRejectedValue(
        new PrismaClientKnownRequestError('database secret', {
          code: 'P2025',
          clientVersion: '7.8.0',
        }),
      );
      const result = await repository.submitInterviewSession('session', data);
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected submission conflict');
      expect(result.error).toBeInstanceOf(InterviewSubmissionConflictError);
      expect(result.error.message).not.toContain('database secret');
    });

    it.each([
      new Error('database secret'),
      new PrismaClientKnownRequestError('database secret', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    ])('sanitizes other database failures', async (error) => {
      update.mockRejectedValue(error);
      const result = await repository.submitInterviewSession('session', data);
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected persistence error');
      expect(result.error).not.toBeInstanceOf(InterviewSubmissionConflictError);
      expect(result.error.message).toBe('Failed to submit interview session.');
    });
  });
});
