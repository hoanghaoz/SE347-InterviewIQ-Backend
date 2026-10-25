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
import { IInterviewHistoryService } from '../src/modules/interview-history/application/interfaces/interview-history.service.interface';
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
    score: null,
    summary: null,
    questions: [],
  };

  const list = (query = '') =>
    request(app.getHttpServer())
      .get(`${route}${query}`)
      .set('Authorization', `Bearer ${token}`);
  const detailOf = (id: string) =>
    request(app.getHttpServer())
      .get(`${route}/${id}`)
      .set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    getInterviewHistoryAsync.mockReset();
    getInterviewAsync.mockReset();

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

  describe('GET /api/interviews/:id', () => {
    it('returns the detail with the reserved slots present', async () => {
      getInterviewAsync.mockResolvedValue(ok(detail));

      const response = await detailOf(sessionPublicId).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview retrieved successfully',
        data: detail,
      });
      // Khung cho module khác: phải có mặt với giá trị rỗng, không bị lược bỏ
      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(data.score).toBeNull();
      expect(data.summary).toBeNull();
      expect(data.questions).toEqual([]);
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
