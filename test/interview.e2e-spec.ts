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
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';

describe('InterviewController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const createInterviewSessionAsync = jest.fn();
  const cvPublicId = '00000000-0000-4000-8000-000000000002';
  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const route = '/api/interview';

  beforeEach(async () => {
    createInterviewSessionAsync.mockReset();
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [InterviewController],
      providers: [
        JwtAuthGuard,
        {
          provide: IInterviewService,
          useValue: { createInterviewSessionAsync },
        },
      ],
    }).compile();

    token = module.get(JwtService).sign({
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
    expect(body.timestamp).toEqual(expect.any(String));
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
});
