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
import { InterviewCheatLogController } from '../src/modules/interview/api/interview-cheat-log.controller';
import { ICheatLogService } from '../src/modules/interview/application/interfaces/cheat-log.service.interface';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { RolesGuard } from '../src/shared/decorators/roles.guard';

describe('InterviewCheatLogController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const recordCheatEventAsync = jest.fn();
  const getCheatLogsAsync = jest.fn();
  const userId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const route = `/api/interview-session/${sessionId}/cheat-logs`;
  const payload = {
    eventType: 'TAB_SWITCH',
    occurredAt: '2026-11-09T10:05:00.000Z',
    description: 'Switched tab',
  };
  const log = {
    id: '00000000-0000-4000-8000-000000000003',
    eventType: 'TAB_SWITCH',
    description: 'Switched tab',
    occurredAt: '2026-11-09T10:05:00.000Z',
    createdAt: '2026-11-09T10:05:01.000Z',
  };
  const summary = {
    totalCount: 1,
    countsByType: {
      TAB_SWITCH: 1,
      WINDOW_BLUR: 0,
      FACE_MISSING: 0,
      MULTIPLE_FACES: 0,
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    recordCheatEventAsync.mockResolvedValue(ok({ log, summary }));
    getCheatLogsAsync.mockResolvedValue(ok({ logs: [log], summary }));
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [InterviewCheatLogController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: ICheatLogService,
          useValue: { recordCheatEventAsync, getCheatLogsAsync },
        },
      ],
    }).compile();
    token = module.get(JwtService).sign({ sub: userId, role: 'USER' });
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

  describe('POST', () => {
    const post = (body: unknown = payload) =>
      request(app.getHttpServer())
        .post(route)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);

    it('records the event and returns 201 with the log and summary', async () => {
      const response = await post().expect(201);

      expect(response.body).toMatchObject({
        statusCode: 201,
        success: true,
        data: { log, summary },
        message: 'Cheat event recorded',
      });
      expect(recordCheatEventAsync).toHaveBeenCalledWith(
        userId,
        sessionId,
        payload,
      );
    });

    it('accepts a request without a description', async () => {
      await post({
        eventType: 'FACE_MISSING',
        occurredAt: payload.occurredAt,
      }).expect(201);
    });

    it('rejects a request without a token', async () => {
      await request(app.getHttpServer()).post(route).send(payload).expect(401);
      expect(recordCheatEventAsync).not.toHaveBeenCalled();
    });

    it('rejects an unknown event type with field details', async () => {
      const response = await post({
        ...payload,
        eventType: 'COPY_PASTE',
      }).expect(400);

      expect(response.body).toMatchObject({
        errors: [expect.objectContaining({ field: 'eventType' })],
      });
      expect(recordCheatEventAsync).not.toHaveBeenCalled();
    });

    it('rejects an invalid occurredAt', async () => {
      const response = await post({
        ...payload,
        occurredAt: 'yesterday',
      }).expect(400);

      expect(response.body).toMatchObject({
        errors: [expect.objectContaining({ field: 'occurredAt' })],
      });
    });

    it('rejects a description longer than 500 characters', async () => {
      await post({ ...payload, description: 'x'.repeat(501) }).expect(400);
    });

    it('rejects a session id that is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/interview-session/not-a-uuid/cheat-logs')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(400);
    });

    it.each([
      [ErrorCode.NotFound, 404],
      [ErrorCode.Conflict, 409],
      [ErrorCode.BadRequest, 400],
      [ErrorCode.InternalServerError, 500],
    ])('maps a %s service error to HTTP %i', async (code, status) => {
      recordCheatEventAsync.mockResolvedValue(
        err(new AppError(code, 'service message')),
      );

      const response = await post().expect(status);

      expect(response.body).toMatchObject({ success: false, code });
    });
  });

  describe('GET', () => {
    const get = () =>
      request(app.getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${token}`);

    it('returns 200 with the logs and summary', async () => {
      const response = await get().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: { logs: [log], summary },
      });
      expect(getCheatLogsAsync).toHaveBeenCalledWith(userId, sessionId);
    });

    it('rejects a request without a token', async () => {
      await request(app.getHttpServer()).get(route).expect(401);
    });

    it('maps a missing session to 404', async () => {
      getCheatLogsAsync.mockResolvedValue(
        err(new AppError(ErrorCode.NotFound, 'Interview session not found')),
      );

      const response = await get().expect(404);

      expect(response.body).toMatchObject({ code: ErrorCode.NotFound });
    });
  });
});
