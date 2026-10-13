import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import type { CvSnapshot } from '../../cv/domain/repositories/cv.repo.interface';
import {
  InterviewStartConflictError,
  InterviewSubmissionConflictError,
} from '../domain/errors/interview-domain.error';
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
  const findMany = jest.fn();
  const count = jest.fn();
  const prisma = {
    interviewSession: { create, update, findUnique, findMany, count },
  } as unknown as PrismaService;
  const repository = new InterviewRepository(prisma);

  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    findUnique.mockReset();
    findMany.mockReset();
    count.mockReset();
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
      findUnique.mockResolvedValue({
        id: 3,
        userId: 1,
        cvId: 2,
        status: CommonSessionStatus.CREATED,
      });
      const result = await repository.authorizeInterviewSession(
        'session',
        'user',
        'cv',
      );
      expect(result.isOk()).toBe(true);
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        sessionId: 3,
        userId: 1,
        cvId: 2,
        status: CommonSessionStatus.CREATED,
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          publicId: 'session',
          user: { publicId: 'user' },
          cv: { publicId: 'cv' },
        },
        select: { id: true, cvId: true, userId: true, status: true },
      });
    });

    it('authorizes start by owner without requiring a CV and returns status', async () => {
      findUnique.mockResolvedValue({
        id: 3,
        userId: 1,
        cvId: null,
        status: 'CREATED',
      });
      const result = await repository.authorizeInterviewSession(
        'session',
        'user',
      );
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        sessionId: 3,
        userId: 1,
        cvId: null,
        status: CommonSessionStatus.CREATED,
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { publicId: 'session', user: { publicId: 'user' } },
        select: { id: true, cvId: true, userId: true, status: true },
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

  describe('getInterviewSessions', () => {
    it('filters list and count by public owner, paginates with stable order and maps nullable CVs', async () => {
      findMany.mockResolvedValue([
        {
          publicId: 'session',
          cv: { publicId: 'cv' },
          title: 'Backend',
          status: 'CREATED',
          totalQuestions: 5,
          jobDescription: 'Developer',
          createdAt: new Date('2026-10-13T08:00:00.000Z'),
        },
        {
          publicId: 'session-no-cv',
          cv: null,
          title: 'No CV',
          status: 'IN_PROGRESS',
          totalQuestions: 7,
          jobDescription: null,
          createdAt: new Date('2026-10-12T08:00:00.000Z'),
        },
      ]);
      count.mockResolvedValue(5);
      const result = await repository.getInterviewSessions('user', {
        pageNumber: 2,
        pageSize: 2,
      });
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        items: [
          {
            sessionPublicId: 'session',
            cvPublicId: 'cv',
            title: 'Backend',
            status: CommonSessionStatus.CREATED,
            totalQuestion: 5,
            jobDescription: 'Developer',
            createdAt: new Date('2026-10-13T08:00:00.000Z'),
          },
          {
            sessionPublicId: 'session-no-cv',
            cvPublicId: null,
            title: 'No CV',
            status: CommonSessionStatus.IN_PROGRESS,
            totalQuestion: 7,
            jobDescription: null,
            createdAt: new Date('2026-10-12T08:00:00.000Z'),
          },
        ],
        totalPages: 3,
        currentPage: 2,
        pageNumber: 2,
        pageSize: 2,
        hasPrevious: true,
        hasNext: true,
      });
      expect(findMany).toHaveBeenCalledWith({
        where: { user: { publicId: 'user' } },
        skip: 2,
        take: 2,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          publicId: true,
          cv: { select: { publicId: true } },
          title: true,
          status: true,
          jobDescription: true,
          totalQuestions: true,
          createdAt: true,
        },
      });
      expect(count).toHaveBeenCalledWith({
        where: { user: { publicId: 'user' } },
      });
    });
    it.each([0, 5])(
      'returns empty items for empty or out-of-range lists with count %s',
      async (total) => {
        findMany.mockResolvedValue([]);
        count.mockResolvedValue(total);
        const result = await repository.getInterviewSessions('user', {
          pageNumber: 10,
          pageSize: 2,
        });
        if (result.isErr()) throw result.error;
        expect(result.value.items).toEqual([]);
        expect(result.value.totalPages).toBe(total === 0 ? 0 : 3);
        expect(result.value.currentPage).toBe(10);
      },
    );
    it.each(['list', 'count'])(
      'sanitizes %s query failures',
      async (source) => {
        findMany.mockResolvedValue([]);
        count.mockResolvedValue(0);
        (source === 'list' ? findMany : count).mockRejectedValue(
          new Error('database secret'),
        );
        const result = await repository.getInterviewSessions('user', {
          pageNumber: 1,
          pageSize: 20,
        });
        if (result.isOk()) throw new Error('Expected list error');
        expect(result.error.message).not.toContain('database secret');
      },
    );
  });

  describe('startInterviewSession', () => {
    const startedAt = new Date('2026-10-13T08:00:00.000Z');
    it('updates only the owned CREATED session and saves the supplied time', async () => {
      update.mockResolvedValue({});
      const result = await repository.startInterviewSession(1, 3, startedAt);
      if (result.isErr()) throw result.error;
      expect(result.value).toBeUndefined();
      expect(update).toHaveBeenCalledWith({
        where: { id: 3, userId: 1, status: 'CREATED' },
        data: { status: 'IN_PROGRESS', startedAt },
      });
    });
    it('maps a lost race P2025 to conflict without retrying or overwriting the first timestamp', async () => {
      update.mockRejectedValue(
        new PrismaClientKnownRequestError('database secret', {
          code: 'P2025',
          clientVersion: '7.8.0',
        }),
      );
      const result = await repository.startInterviewSession(1, 3, startedAt);
      if (result.isOk()) throw new Error('Expected conflict');
      expect(result.error).toBeInstanceOf(InterviewStartConflictError);
      expect(update).toHaveBeenCalledTimes(1);
    });
    it.each([
      new Error('database secret'),
      new PrismaClientKnownRequestError('database secret', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    ])('sanitizes other update failures', async (error) => {
      update.mockRejectedValue(error);
      const result = await repository.startInterviewSession(1, 3, startedAt);
      if (result.isOk()) throw new Error('Expected update error');
      expect(result.error).not.toBeInstanceOf(InterviewStartConflictError);
      expect(result.error.message).not.toContain('database secret');
    });
  });

  describe('submitInterviewSession', () => {
    const cvSnapshot: CvSnapshot = {
      sourceCvPublicId: '00000000-0000-4000-8000-000000000002',
      fileName: 'cv.pdf',
      fileUrl: 'https://example.com/cv.pdf',
      fileSize: 1024,
      rawText: 'Backend developer',
      parserVersion: 'v1',
      parsedData: {
        summary: null,
        skills: {
          languages: ['TypeScript'],
          frameworks: [],
          databases: ['PostgreSQL'],
          tools: [],
        },
        experiences: [],
        education: [],
        projects: [],
      },
    };
    const data = {
      totalQuestions: 7,
      durationSeconds: 0,
      submittedAt: new Date('2026-10-12T10:00:00.000Z'),
      cvSnapshot,
    };

    it('saves supplied metrics, CV snapshot and timestamp as SUBMITTED with an allowed-state guard', async () => {
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
          cvSnapshot,
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
