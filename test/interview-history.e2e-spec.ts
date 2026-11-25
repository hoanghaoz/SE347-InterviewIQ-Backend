import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { InterviewHistoryController } from '../src/modules/interview-history/api/interview-history.controller';
import { IHistoryInsightService } from '../src/modules/interview-history/application/interfaces/history-insight.service.interface';
import { IInterviewHistoryService } from '../src/modules/interview-history/application/interfaces/interview-history.service.interface';
import { IInterviewStatsService } from '../src/modules/interview-history/application/interfaces/interview-stats.service.interface';
import { CommonSessionStatus } from '../src/modules/interview/domain/enums/interview-enum';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { PageResult } from '../src/shared/common/pagination';
import { RolesGuard } from '../src/shared/decorators/roles.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';

/**
 * Chạy 2 endpoint lịch sử phỏng vấn qua HTTP thật với JwtAuthGuard, RolesGuard,
 * ValidationPipe và AllExceptionsFilter thật. Service được mock để test tập
 * trung vào tầng HTTP: xác thực, validate query, map Result sang status code.
 */
describe('InterviewHistoryController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const getInterviewHistoryAsync = jest.fn();
  const getInterviewAsync = jest.fn();
  const getInterviewStatsAsync = jest.fn();
  const getInsightAsync = jest.fn();
  const generateInsightAsync = jest.fn();

  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const sessionPublicId = '00000000-0000-4000-8000-000000000003';
  const route = '/api/interviews';

  const item = {
    id: sessionPublicId,
    title: 'Backend Intern - NestJS',
    status: CommonSessionStatus.COMPLETED,
    totalQuestions: 5,
    durationSeconds: 842,
    overallScore: 7.5,
    isFlagged: true,
    cheatEventCount: 2,
    startedAt: '2026-10-20T08:00:00.000Z',
    completedAt: '2026-10-20T08:14:02.000Z',
    createdAt: '2026-10-20T07:58:11.000Z',
  };

  const detail = {
    ...item,
    jobDescription: 'Xay dung REST API voi NestJS',
    submittedAt: '2026-10-20T08:13:40.000Z',
    cv: {
      id: '00000000-0000-4000-8000-000000000002',
      fileName: 'nguyen-van-a-cv.pdf',
    },
    score: {
      contentScore: 8,
      relevanceScore: 7.5,
      confidenceScore: 7,
      overallScore: 7.6,
      maxScore: 10,
      scoredAt: '2026-10-20T08:14:02.000Z',
    },
    summary: {
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
    },
    questions: [
      {
        id: '00000000-0000-4000-8000-0000000000b1',
        orderIndex: 1,
        content: 'Explain DI in NestJS',
        domain: 'TECHNICAL',
        difficulty: 'MEDIUM',
        answer: {
          videoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/a.webm',
          durationSeconds: 95,
          transcript: 'My answer',
        },
      },
      {
        id: '00000000-0000-4000-8000-0000000000b2',
        orderIndex: 2,
        content: 'Tell me about a hard bug',
        domain: 'BEHAVIORAL',
        difficulty: 'HARD',
        answer: null,
      },
    ],
    cheatSummary: {
      totalCount: 1,
      countsByType: {
        TAB_SWITCH: 1,
        WINDOW_BLUR: 0,
        FACE_MISSING: 0,
        MULTIPLE_FACES: 0,
      },
    },
    cheatLogs: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        eventType: 'TAB_SWITCH',
        description: null,
        occurredAt: '2026-10-20T08:05:00.000Z',
        createdAt: '2026-10-20T08:05:01.000Z',
      },
    ],
  };

  const list = (query = '') =>
    request(app.getHttpServer())
      .get(`${route}${query}`)
      .set('Authorization', `Bearer ${token}`);
  const detailOf = (id: string) =>
    request(app.getHttpServer())
      .get(`${route}/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const getInsight = () =>
    request(app.getHttpServer())
      .get(`${route}/insight`)
      .set('Authorization', `Bearer ${token}`);
  const postInsight = () =>
    request(app.getHttpServer())
      .post(`${route}/insight`)
      .set('Authorization', `Bearer ${token}`);

  const insightState = {
    completedSessions: 3,
    minCompletedSessions: 2,
    canGenerate: true,
    isStale: false,
    insight: {
      overallFeedback: 'Tiến bộ đều ở phần kỹ thuật.',
      strengths: [
        { category: 'TECHNICAL_KNOWLEDGE', title: 'DI', description: 'Clear' },
      ],
      weaknesses: [
        {
          category: 'COMMUNICATION',
          title: 'Dài dòng',
          description: 'Đi vòng',
        },
      ],
      recommendations: [{ title: 'STAR', description: 'Luyện kể chuyện' }],
      basedOnSessionCount: 3,
      generatedAt: '2026-10-21T00:00:00.000Z',
    },
  };

  const statsOf = (query = '') =>
    request(app.getHttpServer())
      .get(`${route}/stats${query}`)
      .set('Authorization', `Bearer ${token}`);

  const statsSession = {
    id: sessionPublicId,
    title: 'Backend Intern - NestJS',
    createdAt: '2026-10-20T07:58:11.000Z',
    contentScore: 8,
    relevanceScore: 7.5,
    confidenceScore: 7,
    overallScore: 7.6,
  };

  const stats = {
    maxScore: 10,
    completedSessions: 1,
    answeredQuestions: 4,
    averages: {
      contentScore: 8,
      relevanceScore: 7.5,
      confidenceScore: 7,
      overallScore: 7.6,
    },
    best: statsSession,
    trend: [statsSession],
    comparison: { latest: statsSession, previous: null, delta: null },
  };

  beforeEach(async () => {
    getInterviewHistoryAsync.mockReset();
    getInterviewAsync.mockReset();
    getInterviewStatsAsync.mockReset();
    getInsightAsync.mockReset();
    generateInsightAsync.mockReset();

    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [InterviewHistoryController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: IInterviewHistoryService,
          useValue: { getInterviewHistoryAsync, getInterviewAsync },
        },
        {
          provide: IInterviewStatsService,
          useValue: { getInterviewStatsAsync },
        },
        {
          provide: IHistoryInsightService,
          useValue: { getInsightAsync, generateInsightAsync },
        },
      ],
    }).compile();

    const jwtService = module.get(JwtService);
    token = jwtService.sign({
      sub: userPublicId,
      email: 'user@example.com',
      role: 'USER',
    });

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            code: ErrorCode.BadRequest,
            message: 'Request validation failed',
            errors: mapValidationErrors(errors),
          }),
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/interviews', () => {
    it('returns the paginated history of the token owner', async () => {
      getInterviewHistoryAsync.mockResolvedValue(
        ok(new PageResult([item], 21, 1, 1, 20)),
      );

      const response = await list().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview history retrieved successfully',
        data: {
          items: [item],
          totalPages: 2,
          currentPage: 1,
          pageSize: 20,
          hasPrevious: false,
          hasNext: true,
        },
      });
    });

    it('returns 401 without a bearer token', async () => {
      await request(app.getHttpServer()).get(route).expect(401);
      expect(getInterviewHistoryAsync).not.toHaveBeenCalled();
    });

    it('applies the default pagination and passes the token subject', async () => {
      getInterviewHistoryAsync.mockResolvedValue(
        ok(new PageResult([], 0, 1, 1, 20)),
      );

      await list().expect(200);

      expect(getInterviewHistoryAsync).toHaveBeenCalledWith(
        userPublicId,
        expect.objectContaining({ pageNumber: 1, pageSize: 20 }),
      );
    });

    // Query string luôn là chuỗi, @Type(() => Number) phải đổi sang số thật
    it('coerces the numeric query params to numbers', async () => {
      getInterviewHistoryAsync.mockResolvedValue(
        ok(new PageResult([], 0, 2, 2, 5)),
      );

      await list('?pageNumber=2&pageSize=5').expect(200);

      // toHaveBeenCalledWith so sánh sâu nên '2' (chuỗi) sẽ không khớp 2 (số)
      expect(getInterviewHistoryAsync).toHaveBeenCalledWith(
        userPublicId,
        expect.objectContaining({ pageNumber: 2, pageSize: 5 }),
      );
    });

    it('forwards the date and status filters', async () => {
      getInterviewHistoryAsync.mockResolvedValue(
        ok(new PageResult([], 0, 1, 1, 20)),
      );

      await list(
        '?fromDate=2026-10-01T00:00:00.000Z&toDate=2026-10-31T00:00:00.000Z&status=COMPLETED',
      ).expect(200);

      expect(getInterviewHistoryAsync).toHaveBeenCalledWith(
        userPublicId,
        expect.objectContaining({
          fromDate: '2026-10-01T00:00:00.000Z',
          toDate: '2026-10-31T00:00:00.000Z',
          status: CommonSessionStatus.COMPLETED,
        }),
      );
    });

    it('rejects a pageSize above the cap', async () => {
      const response = await list('?pageSize=101').expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        errors: [
          { field: 'pageSize', messages: ['pageSize must not exceed 100'] },
        ],
      });
      expect(getInterviewHistoryAsync).not.toHaveBeenCalled();
    });

    it('rejects pageNumber below 1', async () => {
      const response = await list('?pageNumber=0').expect(400);

      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toContain('pageNumber');
    });

    it('rejects an unknown status and a malformed date without echoing the values', async () => {
      const response = await list(
        '?status=NOT_A_STATUS&fromDate=20-10-2026',
      ).expect(400);

      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['status', 'fromDate']));
      expect(JSON.stringify(response.body)).not.toContain('NOT_A_STATUS');
      expect(JSON.stringify(response.body)).not.toContain('20-10-2026');
    });

    it('maps a reversed date range to 400', async () => {
      getInterviewHistoryAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.BadRequest,
            'fromDate must be before or equal to toDate',
          ),
        ),
      );

      const response = await list(
        '?fromDate=2026-10-31T00:00:00.000Z&toDate=2026-10-01T00:00:00.000Z',
      ).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'fromDate must be before or equal to toDate',
        path: route,
      });
    });

    it('hides the repository failure behind a 500', async () => {
      getInterviewHistoryAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to load the interview history',
          ),
        ),
      );

      const response = await list().expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        message: 'Failed to load the interview history',
      });
    });
  });

  describe('GET /api/interviews/stats', () => {
    it('returns the score stats of the token owner', async () => {
      getInterviewStatsAsync.mockResolvedValue(ok(stats));

      const response = await statsOf().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview stats retrieved successfully',
        data: stats,
      });
    });

    // Route tĩnh phải thắng :id; nếu bị khai báo sau thì ParseUUIDPipe trả 400
    it('is not captured by the :id route', async () => {
      getInterviewStatsAsync.mockResolvedValue(ok(stats));

      await statsOf().expect(200);

      expect(getInterviewStatsAsync).toHaveBeenCalledTimes(1);
      expect(getInterviewAsync).not.toHaveBeenCalled();
    });

    it('applies the default limit and passes the token subject', async () => {
      getInterviewStatsAsync.mockResolvedValue(ok(stats));

      await statsOf().expect(200);

      expect(getInterviewStatsAsync).toHaveBeenCalledWith(
        userPublicId,
        expect.objectContaining({ limit: 20 }),
      );
    });

    it('passes the parsed limit and date range to the service', async () => {
      getInterviewStatsAsync.mockResolvedValue(ok(stats));

      await statsOf(
        '?limit=5&fromDate=2026-10-01T00:00:00.000Z&toDate=2026-10-31T23:59:59.000Z',
      ).expect(200);

      expect(getInterviewStatsAsync).toHaveBeenCalledWith(userPublicId, {
        limit: 5,
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-31T23:59:59.000Z',
      });
    });

    it.each(['0', '101', 'abc', '1.5'])(
      'rejects limit=%s with field errors before reaching the service',
      async (limit) => {
        const response = await statsOf(`?limit=${limit}`).expect(400);

        expect(response.body).toMatchObject({
          code: ErrorCode.BadRequest,
          message: 'Request validation failed',
          errors: [expect.objectContaining({ field: 'limit' })],
        });
        expect(getInterviewStatsAsync).not.toHaveBeenCalled();
      },
    );

    it('rejects a fromDate that is not an ISO date string', async () => {
      const response = await statsOf('?fromDate=yesterday').expect(400);

      expect(response.body).toMatchObject({
        errors: [expect.objectContaining({ field: 'fromDate' })],
      });
      expect(getInterviewStatsAsync).not.toHaveBeenCalled();
    });

    it('maps a reversed date range from the service to 400', async () => {
      getInterviewStatsAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.BadRequest,
            'fromDate must be before or equal to toDate',
          ),
        ),
      );

      const response = await statsOf(
        '?fromDate=2026-11-01T00:00:00.000Z&toDate=2026-10-01T00:00:00.000Z',
      ).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'fromDate must be before or equal to toDate',
        path: `${route}/stats`,
      });
    });

    it('returns a sanitized 500 when the service fails', async () => {
      getInterviewStatsAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to load the interview stats',
          ),
        ),
      );

      const response = await statsOf().expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        message: 'Failed to load the interview stats',
      });
    });

    it('returns 401 without a bearer token', async () => {
      await request(app.getHttpServer()).get(`${route}/stats`).expect(401);
      expect(getInterviewStatsAsync).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/interviews/insight', () => {
    it('returns the stored insight state of the token owner', async () => {
      getInsightAsync.mockResolvedValue(ok(insightState));

      const response = await getInsight().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview insight retrieved successfully',
        data: insightState,
      });
      expect(getInsightAsync).toHaveBeenCalledWith(userPublicId);
      expect(generateInsightAsync).not.toHaveBeenCalled();
    });

    it('is not captured by the :id route', async () => {
      getInsightAsync.mockResolvedValue(ok(insightState));

      await getInsight().expect(200);

      expect(getInterviewAsync).not.toHaveBeenCalled();
    });

    it('returns 401 without a bearer token', async () => {
      await request(app.getHttpServer()).get(`${route}/insight`).expect(401);
      expect(getInsightAsync).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/interviews/insight', () => {
    // 200 chứ không phải 201 mặc định của @Post
    it('returns 200 with the refreshed insight', async () => {
      generateInsightAsync.mockResolvedValue(ok(insightState));

      const response = await postInsight().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview insight refreshed successfully',
        data: insightState,
      });
      expect(generateInsightAsync).toHaveBeenCalledWith(userPublicId);
    });

    it('maps a too short history to 400', async () => {
      generateInsightAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.BadRequest,
            'At least 2 completed interviews are needed to generate an insight',
          ),
        ),
      );

      const response = await postInsight().expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message:
          'At least 2 completed interviews are needed to generate an insight',
        path: `${route}/insight`,
      });
    });

    it('maps the generation limit to 429', async () => {
      generateInsightAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.TooManyRequests,
            'Too many insight requests, please try again later',
          ),
        ),
      );

      const response = await postInsight().expect(429);

      expect(response.body).toMatchObject({
        code: ErrorCode.TooManyRequests,
        message: 'Too many insight requests, please try again later',
      });
    });

    it('returns a sanitized 500 when generation fails', async () => {
      generateInsightAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to generate the insight',
          ),
        ),
      );

      const response = await postInsight().expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        message: 'Failed to generate the insight',
      });
    });

    it('returns 401 without a bearer token', async () => {
      await request(app.getHttpServer()).post(`${route}/insight`).expect(401);
      expect(generateInsightAsync).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/interviews/:id', () => {
    it('returns the detail with questions, answers, score and summary', async () => {
      getInterviewAsync.mockResolvedValue(ok(detail));

      const response = await detailOf(sessionPublicId).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview retrieved successfully',
        data: detail,
      });
      // null phải được serialize ra JSON, không bị lược bỏ khỏi response
      const data = (
        response.body as { data: { questions: Record<string, unknown>[] } }
      ).data;
      expect(data.questions[1]).toHaveProperty('answer', null);
    });

    it('serializes score and summary as null while the session is still grading', async () => {
      getInterviewAsync.mockResolvedValue(
        ok({
          ...detail,
          status: CommonSessionStatus.SCORING,
          completedAt: null,
          score: null,
          summary: null,
        }),
      );

      const response = await detailOf(sessionPublicId).expect(200);

      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(data).toHaveProperty('score', null);
      expect(data).toHaveProperty('summary', null);
      expect(data.questions).toHaveLength(2);
    });

    it('hides the repository failure behind a 500', async () => {
      getInterviewAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to load the interview',
          ),
        ),
      );

      const response = await detailOf(sessionPublicId).expect(500);

      expect(response.body).toMatchObject({
        statusCode: 500,
        success: false,
        code: ErrorCode.InternalServerError,
        message: 'Failed to load the interview',
      });
    });

    it('returns 401 without a bearer token', async () => {
      await request(app.getHttpServer())
        .get(`${route}/${sessionPublicId}`)
        .expect(401);
      expect(getInterviewAsync).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a UUID before reaching the service', async () => {
      await detailOf('not-a-uuid').expect(400);

      expect(getInterviewAsync).not.toHaveBeenCalled();
    });

    // Không tồn tại và của người khác đều là 404, không bao giờ 403
    it('maps a missing interview to 404', async () => {
      getInterviewAsync.mockResolvedValue(
        err(new AppError(ErrorCode.NotFound, 'Interview not found')),
      );

      const response = await detailOf(sessionPublicId).expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        success: false,
        code: ErrorCode.NotFound,
        message: 'Interview not found',
        path: `${route}/${sessionPublicId}`,
      });
    });

    it('passes the token subject and the path id to the service', async () => {
      getInterviewAsync.mockResolvedValue(ok(detail));

      await detailOf(sessionPublicId).expect(200);

      expect(getInterviewAsync).toHaveBeenCalledWith(
        userPublicId,
        sessionPublicId,
      );
    });
  });
});
