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
import { ScoringController } from '../src/modules/scoring/api/scoring.controller';
import {
  ScoringJobStatusResponseDto,
  SessionResultResponseDto,
} from '../src/modules/scoring/application/dtos/scoring.response.dto';
import { IScoringService } from '../src/modules/scoring/application/interfaces/scoring.service.interface';
import { ScoringJobStatus } from '../src/modules/scoring/domain/enums/scoring-enum';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { RolesGuard } from '../src/shared/decorators/roles.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';

describe('ScoringController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let adminToken: string;
  let jwtService: JwtService;

  const getJobStatusAsync = jest.fn();
  const getSessionResultAsync = jest.fn();
  const enqueueAsync = jest.fn();

  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const sessionPublicId = '11111111-1111-4111-8111-111111111111';
  const jobId = '33333333-3333-4333-8333-333333333333';

  const mockJobStatus: ScoringJobStatusResponseDto = {
    jobId,
    sessionId: sessionPublicId,
    status: ScoringJobStatus.COMPLETED,
    createdAt: '2026-10-13T16:00:00.000Z',
    completedAt: '2026-10-13T16:02:30.000Z',
  };

  const mockSessionResult: SessionResultResponseDto = {
    sessionId: sessionPublicId,
    scores: {
      publicId: '44444444-4444-4444-8444-444444444444',
      contentScore: 8.5,
      relevanceScore: 8.0,
      confidenceScore: 7.5,
      overallScore: 8.0,
      scoredAt: '2026-10-13T16:02:30.000Z',
    },
    summary: {
      publicId: '55555555-5555-4555-8555-555555555555',
      overallFeedback:
        'Ứng viên thể hiện kiến thức kỹ thuật backend vững vàng, nắm rõ nguyên lý NestJS và tư duy tối ưu cơ sở dữ liệu tốt.',
      strengths: [
        {
          category: 'TECHNICAL_KNOWLEDGE',
          title: 'Kiến thức NestJS & Database tốt',
          description:
            'Giải thích chính xác cơ chế Dependency Injection và phương pháp tối ưu PostgreSQL.',
        },
      ],
      improvements: [
        {
          category: 'COMMUNICATION',
          title: 'Cần áp dụng cấu trúc STAR chặt chẽ hơn',
          description: 'Nên nêu rõ hơn kết quả đo lường được.',
          suggestion:
            'Bổ sung số liệu cụ thể về kết quả sau khi thống nhất giải pháp.',
        },
      ],
      scoringModel: 'gemini-3.8-flash',
      promptVersion: 'v1.0.0',
      generatedAt: '2026-10-13T16:02:30.000Z',
    },
  };

  beforeEach(async () => {
    getJobStatusAsync.mockReset();
    getSessionResultAsync.mockReset();
    enqueueAsync.mockReset();

    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [ScoringController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: IScoringService,
          useValue: {
            getJobStatusAsync,
            getSessionResultAsync,
            enqueueAsync,
          },
        },
      ],
    }).compile();

    jwtService = module.get(JwtService);
    token = jwtService.sign({
      sub: userPublicId,
      email: 'user@example.com',
      role: 'USER',
    });
    adminToken = jwtService.sign({
      sub: 'admin-uuid',
      email: 'admin@example.com',
      role: 'ADMIN',
    });

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
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

  afterEach(async () => app.close());

  describe('GET /api/scoring/jobs/:jobId/status', () => {
    const jobStatusRoute = (id: string) => `/api/scoring/jobs/${id}/status`;

    it.each(['USER', 'ADMIN'])(
      'returns HTTP 200 with job status envelope for %s',
      async (role) => {
        getJobStatusAsync.mockResolvedValue(ok(mockJobStatus));
        const roleToken = role === 'ADMIN' ? adminToken : token;

        const response = await request(app.getHttpServer())
          .get(jobStatusRoute(jobId))
          .set('Authorization', `Bearer ${roleToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          statusCode: 200,
          success: true,
          data: mockJobStatus,
          message: 'Job status retrieved successfully',
        });
        const body = response.body as Record<string, unknown>;
        expect(body.timestamp).toEqual(expect.any(String));
        expect(getJobStatusAsync).toHaveBeenCalledWith(
          jobId,
          role === 'ADMIN' ? 'admin-uuid' : userPublicId,
          role,
        );
      },
    );

    it('rejects an invalid jobId UUID with HTTP 400', async () => {
      const response = await request(app.getHttpServer())
        .get(jobStatusRoute('invalid-uuid'))
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        success: false,
        code: ErrorCode.BadRequest,
        path: jobStatusRoute('invalid-uuid'),
      });
      expect(getJobStatusAsync).not.toHaveBeenCalled();
    });

    it('requires a bearer token (HTTP 401)', async () => {
      const response = await request(app.getHttpServer())
        .get(jobStatusRoute(jobId))
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        success: false,
        code: ErrorCode.Unauthorized,
        path: jobStatusRoute(jobId),
      });
      expect(getJobStatusAsync).not.toHaveBeenCalled();
    });

    it('rejects a token without an allowed role (HTTP 403)', async () => {
      const viewerToken = jwtService.sign({
        sub: userPublicId,
        email: 'viewer@example.com',
        role: 'VIEWER',
      });

      const response = await request(app.getHttpServer())
        .get(jobStatusRoute(jobId))
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        success: false,
        code: ErrorCode.Forbidden,
        path: jobStatusRoute(jobId),
      });
      expect(getJobStatusAsync).not.toHaveBeenCalled();
    });

    it('maps Forbidden error when candidate tries to access another users job (HTTP 403)', async () => {
      getJobStatusAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.Forbidden,
            'User is not authorized to view this scoring job.',
          ),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(jobStatusRoute(jobId))
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        success: false,
        code: ErrorCode.Forbidden,
        message: 'User is not authorized to view this scoring job.',
        path: jobStatusRoute(jobId),
      });
    });

    it('maps NotFound error when job does not exist in queue (HTTP 404)', async () => {
      getJobStatusAsync.mockResolvedValue(
        err(
          new AppError(ErrorCode.NotFound, `Scoring job '${jobId}' not found.`),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(jobStatusRoute(jobId))
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        success: false,
        code: ErrorCode.NotFound,
        message: `Scoring job '${jobId}' not found.`,
        path: jobStatusRoute(jobId),
      });
    });

    it('maps InternalServerError to safe HTTP 500 error envelope', async () => {
      getJobStatusAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to retrieve scoring job status.',
          ),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(jobStatusRoute(jobId))
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(response.body).toMatchObject({
        statusCode: 500,
        success: false,
        code: ErrorCode.InternalServerError,
        path: jobStatusRoute(jobId),
      });
    });
  });

  describe('GET /api/scoring/sessions/:sessionId/result', () => {
    const sessionResultRoute = (id: string) =>
      `/api/scoring/sessions/${id}/result`;

    it.each(['USER', 'ADMIN'])(
      'returns HTTP 200 with full scoring result for %s',
      async (role) => {
        getSessionResultAsync.mockResolvedValue(ok(mockSessionResult));
        const roleToken = role === 'ADMIN' ? adminToken : token;

        const response = await request(app.getHttpServer())
          .get(sessionResultRoute(sessionPublicId))
          .set('Authorization', `Bearer ${roleToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          statusCode: 200,
          success: true,
          data: mockSessionResult,
          message: 'Scoring result retrieved successfully',
        });
        const body = response.body as Record<string, unknown>;
        expect(body.timestamp).toEqual(expect.any(String));
        expect(getSessionResultAsync).toHaveBeenCalledWith(
          sessionPublicId,
          role === 'ADMIN' ? 'admin-uuid' : userPublicId,
          role,
        );
      },
    );

    it('rejects an invalid sessionId UUID with HTTP 400', async () => {
      const response = await request(app.getHttpServer())
        .get(sessionResultRoute('invalid-uuid'))
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        success: false,
        code: ErrorCode.BadRequest,
        path: sessionResultRoute('invalid-uuid'),
      });
      expect(getSessionResultAsync).not.toHaveBeenCalled();
    });

    it('returns HTTP 400 when scoring is not completed yet (e.g. SCORING or SUBMITTED)', async () => {
      getSessionResultAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.BadRequest,
            `Scoring for session '${sessionPublicId}' is not completed yet (current status: SCORING).`,
          ),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(sessionResultRoute(sessionPublicId))
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        success: false,
        code: ErrorCode.BadRequest,
        message: `Scoring for session '${sessionPublicId}' is not completed yet (current status: SCORING).`,
        path: sessionResultRoute(sessionPublicId),
      });
    });

    it('requires a bearer token (HTTP 401)', async () => {
      const response = await request(app.getHttpServer())
        .get(sessionResultRoute(sessionPublicId))
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        success: false,
        code: ErrorCode.Unauthorized,
        path: sessionResultRoute(sessionPublicId),
      });
      expect(getSessionResultAsync).not.toHaveBeenCalled();
    });

    it('rejects roles other than USER or ADMIN (HTTP 403)', async () => {
      const viewerToken = jwtService.sign({
        sub: userPublicId,
        role: 'VIEWER',
      });

      const response = await request(app.getHttpServer())
        .get(sessionResultRoute(sessionPublicId))
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        success: false,
        code: ErrorCode.Forbidden,
        path: sessionResultRoute(sessionPublicId),
      });
      expect(getSessionResultAsync).not.toHaveBeenCalled();
    });

    it('maps Forbidden error when candidate tries to access another users session (HTTP 403)', async () => {
      getSessionResultAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.Forbidden,
            'User is not authorized to access this session scoring result.',
          ),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(sessionResultRoute(sessionPublicId))
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        success: false,
        code: ErrorCode.Forbidden,
        message:
          'User is not authorized to access this session scoring result.',
        path: sessionResultRoute(sessionPublicId),
      });
    });

    it('maps NotFound error when session does not exist (HTTP 404)', async () => {
      getSessionResultAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.NotFound,
            `Interview session '${sessionPublicId}' not found.`,
          ),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(sessionResultRoute(sessionPublicId))
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        success: false,
        code: ErrorCode.NotFound,
        message: `Interview session '${sessionPublicId}' not found.`,
        path: sessionResultRoute(sessionPublicId),
      });
    });

    it('maps InternalServerError to safe HTTP 500 error envelope', async () => {
      getSessionResultAsync.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to retrieve scoring result.',
          ),
        ),
      );

      const response = await request(app.getHttpServer())
        .get(sessionResultRoute(sessionPublicId))
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(response.body).toMatchObject({
        statusCode: 500,
        success: false,
        code: ErrorCode.InternalServerError,
        path: sessionResultRoute(sessionPublicId),
      });
    });
  });
});
