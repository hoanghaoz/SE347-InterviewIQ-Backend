import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  CommonCheatEventType,
  CommonSessionStatus,
} from '../../interview/domain/enums/interview-enum';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../question-generation/domain/enums/question.enum';
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
  const cheatLogPublicId = '00000000-0000-4000-8000-000000000004';
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
    _count: { select: { cheatLogs: true } },
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
    cheatLogs: {
      select: {
        publicId: true,
        eventType: true,
        description: true,
        occurredAt: true,
        createdAt: true,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    },
    // Pin cả các quan hệ của trang chi tiết: không emotionSummary, không
    // scoringModel/promptVersion, câu hỏi luôn theo orderIndex tăng dần.
    questions: {
      select: {
        publicId: true,
        orderIndex: true,
        content: true,
        domain: true,
        difficulty: true,
        answer: {
          select: { videoUrl: true, durationSeconds: true, transcript: true },
        },
      },
      orderBy: { orderIndex: 'asc' },
    },
    score: {
      select: {
        contentScore: true,
        relevanceScore: true,
        confidenceScore: true,
        overallScore: true,
        scoredAt: true,
      },
    },
    interviewSummary: {
      select: { overallFeedback: true, strengths: true, improvements: true },
    },
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
    _count: { cheatLogs: 2 },
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
        cheatEventCount: 2,
        startedAt: sessionRow.startedAt,
        completedAt: sessionRow.completedAt,
        createdAt: sessionRow.createdAt,
      });
    });

    it('reports a cheatEventCount of 0 for a clean session', async () => {
      findMany.mockResolvedValue([{ ...sessionRow, _count: { cheatLogs: 0 } }]);
      count.mockResolvedValue(1);

      const result = await repository.getInterviewHistory(
        userPublicId,
        pagination,
        {},
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items[0].cheatEventCount).toBe(0);
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
      cheatLogs: [
        {
          publicId: cheatLogPublicId,
          eventType: 'TAB_SWITCH',
          description: 'Switched tab',
          occurredAt: new Date('2026-10-20T08:05:00.000Z'),
          createdAt: new Date('2026-10-20T08:05:01.000Z'),
        },
      ],
      questions: [] as unknown[],
      score: null as unknown,
      interviewSummary: null as unknown,
    };

    const questionId1 = '00000000-0000-4000-8000-0000000000b1';
    const questionId2 = '00000000-0000-4000-8000-0000000000b2';
    const scoredAt = new Date('2026-10-20T08:14:02.000Z');

    const questionRow = (
      publicId: string,
      orderIndex: number,
      answer: unknown,
    ) => ({
      publicId,
      orderIndex,
      content: `Question ${orderIndex}`,
      domain: 'TECHNICAL',
      difficulty: 'MEDIUM',
      answer,
    });

    const scoreRow = {
      contentScore: 8,
      relevanceScore: 7.5,
      confidenceScore: 7,
      overallScore: 7.6,
      scoredAt,
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

    // select khớp chính xác DETAIL_SELECT nghĩa là không kéo cvSnapshot,
    // emotionSummary hay scoringModel về
    it('selects only the columns the detail page needs', async () => {
      findFirst.mockResolvedValue(detailRow);

      await repository.getInterviewDetail(userPublicId, sessionPublicId);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: DETAIL_SELECT }),
      );
    });

    // Prisma mock chỉ có interviewSession: một lần findFirst và không có
    // truy vấn nào khác cho từng câu hỏi nghĩa là không có N+1.
    it('loads questions, answers, score and summary in a single findFirst', async () => {
      findFirst.mockResolvedValue({
        ...detailRow,
        questions: [
          questionRow(questionId1, 1, null),
          questionRow(questionId2, 2, null),
        ],
      });

      await repository.getInterviewDetail(userPublicId, sessionPublicId);

      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(findMany).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
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
        cheatLogs: [
          {
            cheatLogPublicId,
            eventType: CommonCheatEventType.TAB_SWITCH,
            description: 'Switched tab',
            occurredAt: new Date('2026-10-20T08:05:00.000Z'),
            createdAt: new Date('2026-10-20T08:05:01.000Z'),
          },
        ],
        questions: [],
        score: null,
        summary: null,
      });
    });

    it('keeps the database order of questions and flattens each answer', async () => {
      findFirst.mockResolvedValue({
        ...detailRow,
        questions: [
          questionRow(questionId1, 1, {
            videoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/a.webm',
            durationSeconds: 95,
            transcript: 'My answer',
          }),
          questionRow(questionId2, 2, null),
        ],
      });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.questions).toEqual([
        {
          questionPublicId: questionId1,
          orderIndex: 1,
          content: 'Question 1',
          domain: QuestionDomain.TECHNICAL,
          difficulty: QuestionDifficulty.MEDIUM,
          answer: {
            videoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/a.webm',
            durationSeconds: 95,
            transcript: 'My answer',
          },
        },
        {
          questionPublicId: questionId2,
          orderIndex: 2,
          content: 'Question 2',
          domain: QuestionDomain.TECHNICAL,
          difficulty: QuestionDifficulty.MEDIUM,
          answer: null,
        },
      ]);
    });

    it('keeps an answer that has no video with videoUrl null', async () => {
      findFirst.mockResolvedValue({
        ...detailRow,
        questions: [
          questionRow(questionId1, 1, {
            videoUrl: null,
            durationSeconds: null,
            transcript: '',
          }),
        ],
      });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.questions[0].answer).toEqual({
        videoUrl: null,
        durationSeconds: null,
        transcript: '',
      });
    });

    it('maps the score and the summary rows as stored', async () => {
      findFirst.mockResolvedValue({
        ...detailRow,
        score: scoreRow,
        interviewSummary: {
          overallFeedback: 'Good fundamentals',
          strengths: [
            {
              category: 'TECHNICAL_KNOWLEDGE',
              title: 'DI',
              description: 'Clear',
            },
          ],
          improvements: [
            {
              category: 'COMMUNICATION',
              title: 'Examples',
              description: 'Too theoretical',
              suggestion: 'Use STAR',
            },
          ],
        },
      });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.score).toEqual(scoreRow);
      expect(result.value?.summary).toEqual({
        overallFeedback: 'Good fundamentals',
        strengths: [
          {
            category: 'TECHNICAL_KNOWLEDGE',
            title: 'DI',
            description: 'Clear',
          },
        ],
        improvements: [
          {
            category: 'COMMUNICATION',
            title: 'Examples',
            description: 'Too theoretical',
            suggestion: 'Use STAR',
          },
        ],
      });
    });

    // Cột Json không có kiểu: bản ghi hỏng không được làm vỡ response, và key lạ
    // trong Json không được lọt ra ngoài.
    it('drops malformed feedback items and unknown keys from the Json columns', async () => {
      findFirst.mockResolvedValue({
        ...detailRow,
        interviewSummary: {
          overallFeedback: 'Feedback',
          strengths: [
            { category: 'A', title: 'T', description: 'D', internal: 'x' },
            { category: 'B', title: 42, description: 'D' },
            'not-an-object',
            null,
          ],
          improvements: [
            { category: 'C', title: 'T', description: 'D', suggestion: 7 },
          ],
        },
      });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.summary?.strengths).toEqual([
        { category: 'A', title: 'T', description: 'D' },
      ]);
      // suggestion không phải chuỗi thì bị bỏ, key vắng mặt chứ không undefined
      expect(result.value?.summary?.improvements).toEqual([
        { category: 'C', title: 'T', description: 'D' },
      ]);
      expect(result.value?.summary?.improvements[0]).not.toHaveProperty(
        'suggestion',
      );
    });

    it('returns empty feedback lists when the Json columns are not arrays', async () => {
      findFirst.mockResolvedValue({
        ...detailRow,
        interviewSummary: {
          overallFeedback: 'Feedback',
          strengths: { category: 'A' },
          improvements: null,
        },
      });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.summary?.strengths).toEqual([]);
      expect(result.value?.summary?.improvements).toEqual([]);
    });

    it('returns an empty cheatLogs array when the session has no violation', async () => {
      findFirst.mockResolvedValue({ ...detailRow, cheatLogs: [] });

      const result = await repository.getInterviewDetail(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value?.cheatLogs).toEqual([]);
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
