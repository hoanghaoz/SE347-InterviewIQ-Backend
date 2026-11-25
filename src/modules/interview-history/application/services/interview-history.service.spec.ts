import { ok, err } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import {
  CommonCheatEventType,
  CommonSessionStatus,
} from '../../../interview/domain/enums/interview-enum';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';
import type {
  InterviewHistoryQuestionData,
  InterviewHistoryScoreData,
  InterviewHistorySummaryData,
} from '../../domain/repositories/interview-history.repo.interface';
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
    cheatEventCount: 0,
    startedAt: new Date('2026-10-20T08:00:00.000Z'),
    completedAt: new Date('2026-10-20T08:14:02.000Z'),
    createdAt: new Date('2026-10-20T07:58:11.000Z'),
  };

  const cheatLogData = (
    cheatLogPublicId: string,
    eventType: CommonCheatEventType,
    occurredAt: string,
  ) => ({
    cheatLogPublicId,
    eventType,
    description: null,
    occurredAt: new Date(occurredAt),
    createdAt: new Date(occurredAt),
  });

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
    cheatLogs: [] as ReturnType<typeof cheatLogData>[],
    questions: [] as InterviewHistoryQuestionData[],
    score: null as InterviewHistoryScoreData | null,
    summary: null as InterviewHistorySummaryData | null,
  };

  const questionId1 = '00000000-0000-4000-8000-0000000000b1';
  const questionId2 = '00000000-0000-4000-8000-0000000000b2';

  const scoreData: InterviewHistoryScoreData = {
    contentScore: 8,
    relevanceScore: 7.5,
    confidenceScore: 7,
    overallScore: 7.6,
    scoredAt: new Date('2026-10-20T08:14:02.000Z'),
  };

  const summaryData: InterviewHistorySummaryData = {
    overallFeedback: 'Good fundamentals',
    strengths: [
      { category: 'TECHNICAL_KNOWLEDGE', title: 'DI', description: 'Clear' },
    ],
    improvements: [
      {
        category: 'COMMUNICATION',
        title: 'Examples',
        description: 'Too theoretical',
        suggestion: 'Use STAR',
      },
    ],
  };

  const questionsData: InterviewHistoryQuestionData[] = [
    {
      questionPublicId: questionId1,
      orderIndex: 1,
      content: 'Explain DI in NestJS',
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
      content: 'Tell me about a hard bug',
      domain: QuestionDomain.BEHAVIORAL,
      difficulty: QuestionDifficulty.HARD,
      answer: null,
    },
  ];

  // Buổi đã chấm xong, có đủ câu hỏi, điểm và nhận xét
  const scoredDetail = {
    ...detailData,
    questions: questionsData,
    score: scoreData,
    summary: summaryData,
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
          isFlagged: false,
          cheatEventCount: 0,
          startedAt: '2026-10-20T08:00:00.000Z',
          completedAt: '2026-10-20T08:14:02.000Z',
          createdAt: '2026-10-20T07:58:11.000Z',
        },
      ]);
    });

    it('flags a session that has cheat events and exposes the count', async () => {
      interviewHistoryRepo.getInterviewHistory.mockResolvedValue(
        ok({ items: [{ ...itemData, cheatEventCount: 3 }], totalItems: 1 }),
      );

      const result = await service.getInterviewHistoryAsync(
        userPublicId,
        query,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.items[0]).toMatchObject({
        isFlagged: true,
        cheatEventCount: 3,
      });
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
    it('maps the detail of a session that has no question, score or summary yet', async () => {
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
        isFlagged: false,
        cheatSummary: {
          totalCount: 0,
          countsByType: {
            TAB_SWITCH: 0,
            WINDOW_BLUR: 0,
            FACE_MISSING: 0,
            MULTIPLE_FACES: 0,
          },
        },
        cheatLogs: [],
      });
    });

    it('flags the session and summarises its cheat logs by type', async () => {
      const logId1 = '00000000-0000-4000-8000-0000000000a1';
      const logId2 = '00000000-0000-4000-8000-0000000000a2';
      const logId3 = '00000000-0000-4000-8000-0000000000a3';
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        ok({
          ...detailData,
          cheatLogs: [
            cheatLogData(
              logId1,
              CommonCheatEventType.TAB_SWITCH,
              '2026-10-20T08:01:00.000Z',
            ),
            cheatLogData(
              logId2,
              CommonCheatEventType.TAB_SWITCH,
              '2026-10-20T08:02:00.000Z',
            ),
            cheatLogData(
              logId3,
              CommonCheatEventType.FACE_MISSING,
              '2026-10-20T08:03:00.000Z',
            ),
          ],
        }),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.isFlagged).toBe(true);
      expect(result.value.cheatSummary).toEqual({
        totalCount: 3,
        countsByType: {
          TAB_SWITCH: 2,
          WINDOW_BLUR: 0,
          FACE_MISSING: 1,
          MULTIPLE_FACES: 0,
        },
      });
      expect(result.value.cheatLogs.map((log) => log.id)).toEqual([
        logId1,
        logId2,
        logId3,
      ]);
      expect(result.value.cheatLogs[0]).toEqual({
        id: logId1,
        eventType: 'TAB_SWITCH',
        description: null,
        occurredAt: '2026-10-20T08:01:00.000Z',
        createdAt: '2026-10-20T08:01:00.000Z',
      });
    });

    it('returns the session score with its scale and the summary once COMPLETED', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        ok(scoredDetail),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.score).toEqual({
        contentScore: 8,
        relevanceScore: 7.5,
        confidenceScore: 7,
        overallScore: 7.6,
        maxScore: 10,
        scoredAt: '2026-10-20T08:14:02.000Z',
      });
      expect(result.value.summary).toEqual({
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

    it('maps every question with its answer, and keeps an unanswered one as answer null', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        ok(scoredDetail),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.questions).toEqual([
        {
          id: questionId1,
          orderIndex: 1,
          content: 'Explain DI in NestJS',
          domain: QuestionDomain.TECHNICAL,
          difficulty: QuestionDifficulty.MEDIUM,
          answer: {
            videoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/a.webm',
            durationSeconds: 95,
            transcript: 'My answer',
          },
        },
        {
          id: questionId2,
          orderIndex: 2,
          content: 'Tell me about a hard bug',
          domain: QuestionDomain.BEHAVIORAL,
          difficulty: QuestionDifficulty.HARD,
          answer: null,
        },
      ]);
    });

    // Bản ghi điểm đã có nhưng status chưa COMPLETED (đọc lệch snapshot hoặc
    // dữ liệu cũ): chưa phải kết quả cuối nên không được lộ ra.
    it.each([
      CommonSessionStatus.SUBMITTED,
      CommonSessionStatus.SCORING,
      CommonSessionStatus.FAILED,
    ])(
      'hides the score and the summary while the status is %s even if rows exist',
      async (status) => {
        interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
          ok({ ...scoredDetail, status }),
        );

        const result = await service.getInterviewAsync(
          userPublicId,
          sessionPublicId,
        );

        if (result.isErr()) throw result.error;
        expect(result.value.status).toBe(status);
        expect(result.value.score).toBeNull();
        expect(result.value.summary).toBeNull();
      },
    );

    // Chấm thất bại không làm mất câu trả lời đã ghi
    it('still returns the recorded questions and answers when grading FAILED', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        ok({ ...scoredDetail, status: CommonSessionStatus.FAILED }),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.questions).toHaveLength(2);
      expect(result.value.questions[0].answer?.transcript).toBe('My answer');
    });

    // COMPLETED mà thiếu bản ghi (không nên xảy ra) thì trả null, không bịa điểm
    it('returns score and summary null when COMPLETED but the rows are missing', async () => {
      interviewHistoryRepo.getInterviewDetail.mockResolvedValue(
        ok({ ...scoredDetail, score: null, summary: null }),
      );

      const result = await service.getInterviewAsync(
        userPublicId,
        sessionPublicId,
      );

      if (result.isErr()) throw result.error;
      expect(result.value.score).toBeNull();
      expect(result.value.summary).toBeNull();
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
