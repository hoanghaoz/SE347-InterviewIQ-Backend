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
import { InterviewController } from '../src/modules/interview/api/interview.controller';
import { IInterviewService } from '../src/modules/interview/application/interfaces/interview.service.interface';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { RolesGuard } from '../src/shared/decorators/roles.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';

describe('InterviewController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let jwtService: JwtService;
  const createInterviewSessionAsync = jest.fn();
  const submitInterviewSessionAsync = jest.fn();
  const sessionPublicId = '00000000-0000-4000-8000-000000000003';
  const cvPublicId = '00000000-0000-4000-8000-000000000002';
  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const route = '/api/interview-session';

  beforeEach(async () => {
    createInterviewSessionAsync.mockReset();
    submitInterviewSessionAsync.mockReset();
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [InterviewController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: IInterviewService,
          useValue: {
            createInterviewSessionAsync,
            submitInterviewSessionAsync,
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

  it('returns the success envelope with the created publicId', async () => {
    createInterviewSessionAsync.mockResolvedValue(ok('session-public-id'));

    const response = await request(app.getHttpServer())
      .post(route)
      .set('Authorization', `Bearer ${token}`)
      .send({ cvPublicId, title: 'Backend interview' })
      .expect(201);

    expect(response.body).toMatchObject({
      statusCode: 201,
      success: true,
      data: { publicId: 'session-public-id' },
      message: 'Interview session created successfully',
    });
    const body = response.body as unknown as Record<string, unknown>;
    expect(body.timestamp).toEqual(expect.any(String) as unknown);
    expect(createInterviewSessionAsync).toHaveBeenCalledWith(
      userPublicId,
      expect.objectContaining({ cvPublicId, title: 'Backend interview' }),
    );
  });

  it('returns the shared error envelope for a service failure', async () => {
    createInterviewSessionAsync.mockResolvedValue(
      err(new AppError(ErrorCode.NotFound, 'CV not found or unavailable')),
    );

    const response = await request(app.getHttpServer())
      .post(route)
      .set('Authorization', `Bearer ${token}`)
      .send({ cvPublicId, title: 'Backend interview' })
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      success: false,
      code: ErrorCode.NotFound,
      message: 'CV not found or unavailable',
      path: route,
    });
  });

  it('returns both field errors when the request exceeds length limits', async () => {
    const response = await request(app.getHttpServer())
      .post(route)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cvPublicId,
        title: 'x'.repeat(256),
        jobDescription: 'y'.repeat(10_001),
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      success: false,
      code: ErrorCode.BadRequest,
      message: 'Request validation failed',
      path: route,
    });
    const body = response.body as unknown as Record<string, unknown>;
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title' }),
        expect.objectContaining({ field: 'jobDescription' }),
      ]),
    );
    expect(createInterviewSessionAsync).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token', async () => {
    const response = await request(app.getHttpServer())
      .post(route)
      .send({ cvPublicId, title: 'Backend interview' })
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      success: false,
      code: ErrorCode.Unauthorized,
      path: route,
    });
    expect(createInterviewSessionAsync).not.toHaveBeenCalled();
  });

  it('rejects a token without an allowed role', async () => {
    const viewerToken = jwtService.sign({
      sub: userPublicId,
      email: 'viewer@example.com',
      role: 'VIEWER',
    });

    const response = await request(app.getHttpServer())
      .post(route)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ cvPublicId, title: 'Backend interview' })
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      success: false,
      code: ErrorCode.Forbidden,
      path: route,
    });
    expect(createInterviewSessionAsync).not.toHaveBeenCalled();
  });

  describe('submission', () => {
    const submitRoute = `${route}/${sessionPublicId}/submit`;
    const payload = { cvPublicId, totalQuestions: 5, durationSeconds: 120 };
    const metadata = {
      sessionPublicId,
      jobId: '00000000-0000-4000-8000-000000000004',
      status: 'QUEUED' as const,
    };

    it.each(['USER', 'ADMIN'])(
      'returns the success envelope and forwards the path UUID for %s',
      async (role) => {
        submitInterviewSessionAsync.mockResolvedValue(ok(metadata));
        const roleToken = jwtService.sign({
          sub: userPublicId,
          email: 'user@example.com',
          role,
        });
        const response = await request(app.getHttpServer())
          .post(submitRoute)
          .set('Authorization', `Bearer ${roleToken}`)
          .send(payload)
          .expect(202);
        expect(response.body).toMatchObject({
          statusCode: 202,
          success: true,
          data: metadata,
          message: 'Interview session submitted successfully',
          timestamp: expect.any(String) as unknown,
        });
        expect(submitInterviewSessionAsync).toHaveBeenCalledWith(
          userPublicId,
          sessionPublicId,
          payload,
        );
      },
    );

    it('accepts one question and zero duration', async () => {
      submitInterviewSessionAsync.mockResolvedValue(ok(metadata));
      await request(app.getHttpServer())
        .post(submitRoute)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...payload, totalQuestions: 1, durationSeconds: 0 })
        .expect(202);
    });

    it.each([
      ['totalQuestions', 0],
      ['totalQuestions', -1],
      ['totalQuestions', 1.5],
      ['totalQuestions', '5'],
      ['totalQuestions', null],
      ['totalQuestions', undefined],
      ['durationSeconds', -1],
      ['durationSeconds', 1.5],
      ['durationSeconds', '120'],
      ['durationSeconds', null],
      ['durationSeconds', undefined],
      ['cvPublicId', 'invalid'],
    ])(
      'rejects invalid %s value %s with safe validation details',
      async (field, value) => {
        const response = await request(app.getHttpServer())
          .post(submitRoute)
          .set('Authorization', `Bearer ${token}`)
          .send({ ...payload, [field]: value })
          .expect(400);
        expect(response.body).toMatchObject({
          statusCode: 400,
          success: false,
          code: ErrorCode.BadRequest,
          path: submitRoute,
        });
        const body = response.body as Record<string, unknown>;
        expect(body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field,
              messages: expect.any(Array) as unknown,
            }),
          ]),
        );
        expect(JSON.stringify(body.errors)).not.toContain('"value"');
        expect(submitInterviewSessionAsync).not.toHaveBeenCalled();
      },
    );

    it('rejects an invalid path UUID before invoking the service', async () => {
      await request(app.getHttpServer())
        .post(`${route}/invalid/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(400);
      expect(submitInterviewSessionAsync).not.toHaveBeenCalled();
    });

    it.each([
      [ErrorCode.NotFound, 404, 'Interview session not found or unavailable'],
      [
        ErrorCode.Conflict,
        409,
        'Interview session cannot be submitted in its current state',
      ],
      [
        ErrorCode.InternalServerError,
        500,
        'Failed to submit interview session',
      ],
    ])('maps a service %s error to HTTP %s', async (code, status, message) => {
      submitInterviewSessionAsync.mockResolvedValue(
        err(new AppError(code, message)),
      );
      const response = await request(app.getHttpServer())
        .post(submitRoute)
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(status);
      expect(response.body).toMatchObject({
        statusCode: status,
        success: false,
        code,
        path: submitRoute,
        timestamp: expect.any(String) as unknown,
      });
      if (status !== 500)
        expect((response.body as Record<string, unknown>).message).toBe(
          message,
        );
    });

    it('requires authentication', async () => {
      const response = await request(app.getHttpServer())
        .post(submitRoute)
        .send(payload)
        .expect(401);
      expect(response.body).toMatchObject({
        success: false,
        code: ErrorCode.Unauthorized,
      });
      expect(submitInterviewSessionAsync).not.toHaveBeenCalled();
    });

    it('rejects roles other than USER or ADMIN', async () => {
      const viewerToken = jwtService.sign({
        sub: userPublicId,
        role: 'VIEWER',
      });
      const response = await request(app.getHttpServer())
        .post(submitRoute)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(payload)
        .expect(403);
      expect(response.body).toMatchObject({
        success: false,
        code: ErrorCode.Forbidden,
      });
      expect(submitInterviewSessionAsync).not.toHaveBeenCalled();
    });
  });
});
