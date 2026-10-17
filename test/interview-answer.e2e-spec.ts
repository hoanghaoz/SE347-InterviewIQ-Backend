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
import { InterviewAnswerController } from '../src/modules/interview/api/interview-answer.controller';
import { IInterviewAnswerService } from '../src/modules/interview/application/interfaces/interview-answer.service.interface';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { RolesGuard } from '../src/shared/decorators/roles.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';

describe('InterviewAnswerController (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let token: string;
  const createSignedParamsAsync = jest.fn();
  const saveAnswerAsync = jest.fn();
  const userId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const questionId = '00000000-0000-4000-8000-000000000003';
  const answerId = '00000000-0000-4000-8000-000000000004';
  const route = `/api/interview-session/${sessionId}/questions/${questionId}/answer`;
  const cloudinaryPublicId = `interview-answers/${userId}/${sessionId}/${questionId}/${answerId}`;
  const payload = { cloudinaryPublicId, transcript: 'My answer' };
  const signed = {
    uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
    apiKey: 'key',
    timestamp: 123,
    signature: 'signature',
    cloudinaryPublicId,
    resourceType: 'video',
    allowedFormats: 'mp4,webm',
    overwrite: false,
    maxFileSizeBytes: 104857600,
  };
  const answer = {
    publicId: answerId,
    questionPublicId: questionId,
    videoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/answer.webm',
    transcript: 'My answer',
    durationSeconds: 13,
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    createSignedParamsAsync.mockResolvedValue(ok(signed));
    saveAnswerAsync.mockResolvedValue(ok(answer));
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [InterviewAnswerController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: IInterviewAnswerService,
          useValue: { createSignedParamsAsync, saveAnswerAsync },
        },
      ],
    }).compile();
    jwtService = module.get(JwtService);
    token = jwtService.sign({ sub: userId, role: 'USER' });
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

  it('returns the upload parameters and forwards the public IDs', async () => {
    const response = await request(app.getHttpServer())
      .post(`${route}/signed-params`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toMatchObject({
      statusCode: 200,
      success: true,
      data: signed,
      message: 'Video upload params signed',
    });
    expect(createSignedParamsAsync).toHaveBeenCalledWith(
      userId,
      sessionId,
      questionId,
    );
    expect(response.body).not.toHaveProperty('data.apiSecret');
  });

  it('returns saved answer metadata and ignores client URL/duration overrides', async () => {
    const response = await request(app.getHttpServer())
      .put(route)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...payload,
        videoUrl: 'https://evil.example/video',
        durationSeconds: 999,
      })
      .expect(200);
    expect(response.body).toMatchObject({
      statusCode: 200,
      success: true,
      data: answer,
      message: 'Interview answer saved successfully',
    });
    expect(saveAnswerAsync).toHaveBeenCalledWith(
      userId,
      sessionId,
      questionId,
      payload,
    );
  });

  it('accepts an empty transcript for a silent answer', async () => {
    await request(app.getHttpServer())
      .put(route)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, transcript: '' })
      .expect(200);
    expect(saveAnswerAsync).toHaveBeenCalledWith(
      userId,
      sessionId,
      questionId,
      { ...payload, transcript: '' },
    );
  });

  it.each([
    ['cloudinaryPublicId', ''],
    ['cloudinaryPublicId', 'x'.repeat(256)],
    ['cloudinaryPublicId', null],
    ['cloudinaryPublicId', undefined],
    ['transcript', null],
    ['transcript', undefined],
    ['transcript', 123],
    ['transcript', 'x'.repeat(50001)],
  ])('rejects invalid %s before service execution', async (field, value) => {
    const response = await request(app.getHttpServer())
      .put(route)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, [field]: value })
      .expect(400);
    expect(response.body).toMatchObject({
      success: false,
      code: ErrorCode.BadRequest,
      path: route,
    });
    expect((response.body as Record<string, unknown>).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    expect(saveAnswerAsync).not.toHaveBeenCalled();
  });

  it.each(['session', 'question'])(
    'validates the %s UUID on both routes',
    async (invalid) => {
      const invalidRoute = `/api/interview-session/${invalid === 'session' ? 'invalid' : sessionId}/questions/${invalid === 'question' ? 'invalid' : questionId}/answer`;
      await request(app.getHttpServer())
        .post(`${invalidRoute}/signed-params`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .put(invalidRoute)
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(400);
      expect(createSignedParamsAsync).not.toHaveBeenCalled();
      expect(saveAnswerAsync).not.toHaveBeenCalled();
    },
  );

  it.each([
    [ErrorCode.NotFound, 404],
    [ErrorCode.Conflict, 409],
    [ErrorCode.BadRequest, 400],
    [ErrorCode.InternalServerError, 500],
  ])(
    'maps %s results to HTTP %s for signing and saving',
    async (code, status) => {
      const failure = err(new AppError(code, 'Operation unavailable'));
      createSignedParamsAsync.mockResolvedValue(failure);
      saveAnswerAsync.mockResolvedValue(failure);
      const signedResponse = await request(app.getHttpServer())
        .post(`${route}/signed-params`)
        .set('Authorization', `Bearer ${token}`)
        .expect(status);
      const savedResponse = await request(app.getHttpServer())
        .put(route)
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(status);
      expect(signedResponse.body).toMatchObject({
        statusCode: status,
        success: false,
        code,
      });
      expect(savedResponse.body).toMatchObject({
        statusCode: status,
        success: false,
        code,
      });
    },
  );

  it('requires authentication for both routes', async () => {
    await request(app.getHttpServer())
      .post(`${route}/signed-params`)
      .expect(401);
    await request(app.getHttpServer()).put(route).send(payload).expect(401);
    expect(createSignedParamsAsync).not.toHaveBeenCalled();
    expect(saveAnswerAsync).not.toHaveBeenCalled();
  });

  it('rejects a VIEWER role for both routes', async () => {
    const viewerToken = jwtService.sign({ sub: userId, role: 'VIEWER' });
    await request(app.getHttpServer())
      .post(`${route}/signed-params`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .put(route)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send(payload)
      .expect(403);
    expect(createSignedParamsAsync).not.toHaveBeenCalled();
    expect(saveAnswerAsync).not.toHaveBeenCalled();
  });

  it('accepts an ADMIN role while forwarding its own identity for ownership checks', async () => {
    const adminToken = jwtService.sign({ sub: userId, role: 'ADMIN' });
    await request(app.getHttpServer())
      .post(`${route}/signed-params`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(route)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);
    expect(saveAnswerAsync).toHaveBeenCalledWith(
      userId,
      sessionId,
      questionId,
      payload,
    );
  });
});
