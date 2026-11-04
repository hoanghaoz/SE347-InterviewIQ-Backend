import { ok, err } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import { InterviewHistoryService } from './interview-history.service';

describe('InterviewHistoryService', () => {
  const interviewHistoryRepo = {
    getInterviewHistory: jest.fn(),
    getInterviewDetail: jest.fn(),
  };

  // Object mock khớp cấu trúc của contract nên truyền thẳng được, không cần ép kiểu
  const service = new InterviewHistoryService(interviewHistoryRepo);

  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const sessionPublicId = '00000000-0000-4000-8000-000000000003';
  const cvPublicId = '00000000-0000-4000-8000-000000000002';

  const itemData = {
    sessionPublicId,
    title: 'Backend Intern - NestJS',
    status: CommonSessionStatus.COMPLETED,
    totalQuestions: 5,
    durationSeconds: 842,
    overallScore: 7.5,
    startedAt: new Date('2026-10-20T08:00:00.000Z'),
    completedAt: new Date('2026-10-20T08:14:02.000Z'),
    createdAt: new Date('2026-10-20T07:58:11.000Z'),
  };

  const detailData = {
    sessionPublicId,
    title: 'Backend Intern - NestJS',
    jobDescription: 'Xay dung REST API voi NestJS',
    status: CommonSessionStatus.COMPLETED,
    totalQuestions: 5,
    durationSeconds: 842,
    startedAt: new Date('2026-10-20T08:00:00.000Z'),
    submittedAt: new Date('2026-10-20T08:13:40.000Z'),
    completedAt: new Date('2026-10-20T08:14:02.000Z'),
    createdAt: new Date('2026-10-20T07:58:11.000Z'),
    cv: { cvPublicId, fileName: 'nguyen-van-a-cv.pdf' },
  };

  const query = { pageNumber: 1, pageSize: 20 };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getInterviewHistoryAsync', () => {
    it('maps each item to the response shape and turns dates into ISO strings', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [itemData], totalItems: 1 }),
      );

      const result = await service.getInterviewHistoryAsync(
        userPublicId,
        query,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items).toEqual([
        {
          id: sessionPublicId,
          title: 'Backend Intern - NestJS',
          status: CommonSessionStatus.COMPLETED,
          totalQuestions: 5,
          durationSeconds: 842,
          overallScore: 7.5,
          startedAt: '2026-10-20T08:00:00.000Z',
          completedAt: '2026-10-20T08:14:02.000Z',
          createdAt: '2026-10-20T07:58:11.000Z',
        },
      ]);
    });

    it('keeps a not-yet-scored session in the list with null score and null timestamps', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({
          items: [
            {
              ...itemData,
              status: CommonSessionStatus.CREATED,
              overallScore: null,
              durationSeconds: null,
              startedAt: null,
              completedAt: null,
            },
          ],
          totalItems: 1,
        }),
      );

      const result = await service.getInterviewHistoryAsync(
        userPublicId,
        query,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items[0]).toMatchObject({
        overallScore: null,
        durationSeconds: null,
        startedAt: null,
        completedAt: null,
      });
    });

    it('builds the pagination block from the real total, not from the mapped page', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [itemData], totalItems: 21 }),
      );

      const result = await service.getInterviewHistoryAsync(userPublicId, {
        pageNumber: 2,
        pageSize: 20,
      });

      if (result.isErr()) throw result.error;
      expect(result.value).toMatchObject({
        totalPages: 2,
        currentPage: 2,
        pageNumber: 2,
        pageSize: 20,
        hasPrevious: true,
        hasNext: false,
      });
    });

    it('passes the pagination and the parsed date filters to the repository', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [], totalItems: 0 }),
      );

      await service.getInterviewHistoryAsync(userPublicId, {
        pageNumber: 3,
        pageSize: 10,
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-31T23:59:59.000Z',
        status: CommonSessionStatus.COMPLETED,
      });

      expect(interviewHistoryRepo.getInterviewHistory).toHaveBeenCalledWith(
        userPublicId,
        { pageNumber: 3, pageSize: 10 },
        {
          fromDate: new Date('2026-10-01T00:00:00.000Z'),
          toDate: new Date('2026-10-31T23:59:59.000Z'),
          status: CommonSessionStatus.COMPLETED,
        },
      );
    });

    it('leaves the filters undefined when the query sent none', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [], totalItems: 0 }),
      );

      await service.getInterviewHistoryAsync(userPublicId, query);

      expect(interviewHistoryRepo.getInterviewHistory).toHaveBeenCalledWith(
        userPublicId,
        query,
        { fromDate: undefined, toDate: undefined, status: undefined },
      );
    });

    it('returns 400 without touching the database when fromDate is after toDate', async () => {
      const result = await service.getInterviewHistoryAsync(userPublicId, {
        ...query,
        fromDate: '2026-10-31T00:00:00.000Z',
        toDate: '2026-10-01T00:00:00.000Z',
      });

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(result.error.message).toBe(
        'fromDate must be before or equal to toDate',
      );
      expect(interviewHistoryRepo.getInterviewHistory).not.toHaveBeenCalled();
    });

    // Lọc đúng một mốc thời gian là hợp lệ, không phải khoảng ngược
    it('accepts fromDate equal to toDate', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [], totalItems: 0 }),
      );

      const result = await service.getInterviewHistoryAsync(userPublicId, {
        ...query,
        fromDate: '2026-10-20T00:00:00.000Z',
        toDate: '2026-10-20T00:00:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(interviewHistoryRepo.getInterviewHistory).toHaveBeenCalled();
    });

    it('returns an empty page instead of an error when the user has no interview', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [], totalItems: 0 }),
      );

      const result = await service.getInterviewHistoryAsync(
        userPublicId,
        query,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items).toEqual([]);
      expect(result.value.totalPages).toBe(0);
      expect(result.value.hasNext).toBe(false);
    });

    it('hides the repository message behind a 500', async () => {
      const repositoryMessage = 'Failed to get the interview history';
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        err(new Error(repositoryMessage)),
      );

      const result = await service.getInterviewHistoryAsync(
        userPublicId,
        query,
      );

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to load the interview history');
    });
  });

  describe('getInterviewAsync', () => {
    it('maps the detail and leaves the slots of the other modules empty', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(ok(detailData));

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        id: sessionPublicId,
        title: 'Backend Intern - NestJS',
        jobDescription: 'Xay dung REST API voi NestJS',
        status: CommonSessionStatus.COMPLETED,
        totalQuestions: 5,
        durationSeconds: 842,
        startedAt: '2026-10-20T08:00:00.000Z',
        submittedAt: '2026-10-20T08:13:40.000Z',
        completedAt: '2026-10-20T08:14:02.000Z',
        createdAt: '2026-10-20T07:58:11.000Z',
        cv: { id: cvPublicId, fileName: 'nguyen-van-a-cv.pdf' },
        score: null,
        summary: null,
        questions: [],
      });
    });

    // questions là [] chứ không null để frontend map thẳng không cần guard
    it('returns questions as an empty array, never null', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(ok(detailData));

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(Array.isArray(result.value.questions)).toBe(true);
      expect(result.value.questions).toHaveLength(0);
    });

    it('returns cv as null when the session has no CV attached', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        ok({ ...detailData, cv: null }),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.cv).toBeNull();
    });

    it('asks the repository with the owner id so another user session cannot be read', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(ok(detailData));

      await service.getInterviewAsync(userPublicId, sessionPublicId);

      expect(interviewHistoryRepo.getInterviewDetail).toHaveBeenCalledWith(
        userPublicId,
        sessionPublicId,
      );
    });

    // Không tồn tại và của người khác dùng chung 404, không bao giờ 403
    it('returns 404 when the repository finds nothing', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(ok(null));

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(result.error.message).toBe('Interview not found');
    });

    it('hides the repository message behind a 500', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        err(new Error('Failed to get the interview')),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to load the interview');
    });
  });
});
