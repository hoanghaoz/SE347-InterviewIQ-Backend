import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { CommonSessionStatus } from '../../interview/domain/enums/interview-enum';
import { InterviewHistoryRepository } from './interview-history.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('InterviewHistoryRepository', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    interviewSession: { findMany, count, findFirst },
  } as unknown as PrismaService;
  const repository = new InterviewHistoryRepository(prisma);

  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const sessionPublicId = '00000000-0000-4000-8000-000000000003';
  const cvPublicId = '00000000-0000-4000-8000-000000000002';
  const pagination = { pageNumber: 1, pageSize: 20 };

  // Pin đúng các cột được đọc: nếu ai thêm jobDescription hay cvSnapshot vào
  // select của màn danh sách thì các assert toHaveBeenCalledWith dưới đây đỏ.
  const LIST_SELECT = {
    publicId: true,
    title: true,
    status: true,
    totalQuestions: true,
    durationSeconds: true,
    startedAt: true,
    completedAt: true,
    createdAt: true,
    score: { select: { overallScore: true } },
  };

  const DETAIL_SELECT = {
    publicId: true,
    title: true,
    jobDescription: true,
    status: true,
    totalQuestions: true,
    durationSeconds: true,
    startedAt: true,
    submittedAt: true,
    completedAt: true,
    createdAt: true,
    cv: { select: { publicId: true, fileName: true } },
  };

  const ownerWhere = { user: { publicId: userPublicId } };

  const sessionRow = {
    publicId: sessionPublicId,
    title: 'Backend Intern - NestJS',
    status: 'COMPLETED',
    totalQuestions: 5,
    durationSeconds: 842,
    startedAt: new Date('2026-10-20T08:00:00.000Z'),
    completedAt: new Date('2026-10-20T08:14:02.000Z'),
    createdAt: new Date('2026-10-20T07:58:11.000Z'),
    score: { overallScore: 7.5 },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('getInterviewHistory', () => {
    it('scopes the query to the owner and returns the real total', async () => {
      findMany.mockResolvedValue([sessionRow]);
      count.mockResolvedValue(21);

      const result = await repository.getInterviewHistory(
        userPublicId,
        pagination,
        {},
      );

      if (result.isErr()) throw result.error;
      expect(result.value.totalItems).toBe(21);
      expect(findMany).toHaveBeenCalledWith({
        where: { user: { publicId: userPublicId } },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: LIST_SELECT,
      });
      // count phải dùng đúng where của findMany, nếu không totalPages sẽ sai
      expect(count).toHaveBeenCalledWith({
        where: { user: { publicId: userPublicId } },
      });
    });

    // where khớp chính xác ownerWhere nghĩa là không có key createdAt/status nào
    it('adds no date or status condition when no filter is given', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      await repository.getInterviewHistory(userPublicId, pagination, {});

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: ownerWhere }),
      );
    });

    it('maps the domain status to the Prisma enum when filtering by status', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      await repository.getInterviewHistory(userPublicId, pagination, {
        status: CommonSessionStatus.COMPLETED,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ...ownerWhere, status: 'COMPLETED' },
        }),
      );
    });

    it('filters createdAt inclusively on both ends', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const fromDate = new Date('2026-10-01T00:00:00.000Z');
      const toDate = new Date('2026-10-31T23:59:59.000Z');

      await repository.getInterviewHistory(userPublicId, pagination, {
        fromDate,
        toDate,
      });

      // gte/lte chứ không gt/lt: hai mốc được tính vào kết quả
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ...ownerWhere, createdAt: { gte: fromDate, lte: toDate } },
        }),
      );
    });

    it('builds a half-open range when only one end is given', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const fromDate = new Date('2026-10-01T00:00:00.000Z');

      await repository.getInterviewHistory(userPublicId, pagination, {
        fromDate,
      });

      // createdAt chỉ có gte, không có lte
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ...ownerWhere, createdAt: { gte: fromDate } },
        }),
      );
    });

    it('skips the right number of rows for a later page', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      await repository.getInterviewHistory(
        userPublicId,
        { pageNumber: 3, pageSize: 10 },
        {},
      );

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('flattens the score relation into overallScore', async () => {
      findMany.mockResolvedValue([sessionRow]);
      count.mockResolvedValue(1);

      const result = await repository.getInterviewHistory(
        userPublicId,
        pagination,
        {},
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items[0]).toEqual({
        sessionPublicId,
        title: 'Backend Intern - NestJS',
        status: CommonSessionStatus.COMPLETED,
        totalQuestions: 5,
        durationSeconds: 842,
        overallScore: 7.5,
        startedAt: sessionRow.startedAt,
        completedAt: sessionRow.completedAt,
        createdAt: sessionRow.createdAt,
      });
    });

    it('returns overallScore null when the session has not been scored', async () => {
      findMany.mockResolvedValue([{ ...sessionRow, score: null }]);
      count.mockResolvedValue(1);

      const result = await repository.getInterviewHistory(
        userPublicId,
        pagination,
        {},
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items[0].overallScore).toBeNull();
    });

    it('returns a generic error and hides the database message when Prisma fails', async () => {
      const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
      findMany.mockRejectedValue(new Error(databaseMessage));
      count.mockResolvedValue(0);

      const result = await repository.getInterviewHistory(
        userPublicId,
        pagination,
        {},
      );

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error.message).toBe('Failed to get the interview history');
      expect(result.error.message).not.toContain(databaseMessage);
    });
  });

  describe('getInterviewDetail', () => {
    const detailRow = {
      publicId: sessionPublicId,
      title: 'Backend Intern - NestJS',
      jobDescription: 'Xay dung REST API voi NestJS',
      status: 'COMPLETED',
      totalQuestions: 5,
      durationSeconds: 842,
      startedAt: new Date('2026-10-20T08:00:00.000Z'),
      submittedAt: new Date('2026-10-20T08:13:40.000Z'),
      completedAt: new Date('2026-10-20T08:14:02.000Z'),
      createdAt: new Date('2026-10-20T07:58:11.000Z'),
      cv: { publicId: cvPublicId, fileName: 'nguyen-van-a-cv.pdf' },
    };

    it('requires both the session id and the owner in the same query', async () => {
      findFirst.mockResolvedValue(detailRow);

      await repository.getInterviewDetail(userPublicId, sessionPublicId);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicId: sessionPublicId, ...ownerWhere },
        }),
      );
    });

    // select khớp chính xác DETAIL_SELECT nghĩa là không kéo cvSnapshot về
    it('never selects the cv snapshot', async () => {
      findFirst.mockResolvedValue(detailRow);

      await repository.getInterviewDetail(userPublicId, sessionPublicId);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: DETAIL_SELECT }),
      );
    });

    it('maps the row and flattens the cv relation', async () => {
      findFirst.mockResolvedValue(detailRow);

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        sessionPublicId,
        title: 'Backend Intern - NestJS',
        jobDescription: 'Xay dung REST API voi NestJS',
        status: CommonSessionStatus.COMPLETED,
        totalQuestions: 5,
        durationSeconds: 842,
        startedAt: detailRow.startedAt,
        submittedAt: detailRow.submittedAt,
        completedAt: detailRow.completedAt,
        createdAt: detailRow.createdAt,
        cv: { cvPublicId, fileName: 'nguyen-van-a-cv.pdf' },
      });
    });

    it('returns cv null when the CV was detached or deleted', async () => {
      findFirst.mockResolvedValue({ ...detailRow, cv: null });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.cv).toBeNull();
    });

    // Service dựa vào ok(null) để trả 404, nên đây không phải nhánh lỗi
    it('returns null when no session matches the id and the owner', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });

    it('returns a generic error and hides the database message when Prisma fails', async () => {
      const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
      findFirst.mockRejectedValue(new Error(databaseMessage));

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error.message).toBe('Failed to get the interview');
      expect(result.error.message).not.toContain(databaseMessage);
    });
  });
});
