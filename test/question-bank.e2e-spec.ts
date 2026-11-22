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
import { QuestionBankSessionController } from '../src/modules/question-bank/api/question-bank-session.controller';
import { QuestionBankController } from '../src/modules/question-bank/api/question-bank.controller';
import { IQuestionBankService } from '../src/modules/question-bank/application/interfaces/question-bank.service.interface';
import { PageResult } from '../src/shared/common/pagination';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { RolesGuard } from '../src/shared/decorators/roles.guard';

describe('QuestionBankController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let jwtService: JwtService;
  const listAsync = jest.fn();
  const saveFromSessionAsync = jest.fn();
  const deleteAsync = jest.fn();
  const useInSessionAsync = jest.fn();
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const questionId = '00000000-0000-4000-8000-000000000003';
  const userId = '00000000-0000-4000-8000-000000000001';
  const route = '/api/question-bank';
  const item = {
    id: '00000000-0000-4000-8000-000000000010',
    content: 'Explain the difference between a process and a thread.',
    domain: 'TECHNICAL',
    difficulty: 'MEDIUM',
    createdAt: '2026-11-22T07:58:11.000Z',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    listAsync.mockResolvedValue(ok(new PageResult([item], 1, 1, 1, 20)));
    saveFromSessionAsync.mockResolvedValue(
      ok({ savedCount: 3, skippedCount: 1 }),
    );
    deleteAsync.mockResolvedValue(ok(undefined));
    useInSessionAsync.mockResolvedValue(
      ok({ sessionPublicId: sessionId, questions: [] }),
    );
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [QuestionBankController, QuestionBankSessionController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        {
          provide: IQuestionBankService,
          useValue: {
            listAsync,
            saveFromSessionAsync,
            deleteAsync,
            useInSessionAsync,
          },
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

  const get = (query = '') =>
    request(app.getHttpServer())
      .get(`${route}${query}`)
      .set('Authorization', `Bearer ${token}`);

  it('returns the page in the shared success envelope with the caller identity', async () => {
    const response = await get().expect(200);
    expect(response.body).toMatchObject({
      statusCode: 200,
      success: true,
      message: 'Question bank retrieved successfully',
      data: {
        items: [item],
        totalPages: 1,
        currentPage: 1,
        pageNumber: 1,
        pageSize: 20,
        hasPrevious: false,
        hasNext: false,
      },
    });
    expect(listAsync).toHaveBeenCalledWith(userId, expect.anything());
  });

  it('applies the default pagination', async () => {
    await get().expect(200);
    expect(listAsync).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ pageNumber: 1, pageSize: 20 }),
    );
  });

  it('converts query strings and forwards the filters', async () => {
    await get(
      '?pageNumber=2&pageSize=50&domain=BEHAVIORAL&difficulty=HARD&search=%20team%20',
    ).expect(200);
    expect(listAsync).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        pageNumber: 2,
        pageSize: 50,
        domain: 'BEHAVIORAL',
        difficulty: 'HARD',
        search: 'team',
      }),
    );
  });

  it.each([
    ['pageNumber', 'pageNumber=0'],
    ['pageNumber', 'pageNumber=abc'],
    ['pageSize', 'pageSize=0'],
    ['pageSize', 'pageSize=101'],
    ['pageSize', 'pageSize=1000000'],
    ['domain', 'domain=HOBBY'],
    ['difficulty', 'difficulty=EXTREME'],
    ['search', `search=${'x'.repeat(101)}`],
  ])(
    'rejects an invalid %s before service execution (%s)',
    async (field, q) => {
      const response = await get(`?${q}`).expect(400);
      expect(response.body).toMatchObject({
        success: false,
        code: ErrorCode.BadRequest,
      });
      expect((response.body as Record<string, unknown>).errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
      expect(listAsync).not.toHaveBeenCalled();
    },
  );

  it('accepts pageSize at the 100 item cap', async () => {
    await get('?pageSize=100').expect(200);
  });

  it('maps a service failure to a sanitized 500', async () => {
    listAsync.mockResolvedValue(
      err(new AppError(ErrorCode.InternalServerError, 'Failed to load')),
    );
    const response = await get().expect(500);
    expect(response.body).toMatchObject({
      success: false,
      code: ErrorCode.InternalServerError,
    });
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get(route).expect(401);
    expect(listAsync).not.toHaveBeenCalled();
  });

  it('rejects a VIEWER role', async () => {
    const viewer = jwtService.sign({ sub: userId, role: 'VIEWER' });
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${viewer}`)
      .expect(403);
    expect(listAsync).not.toHaveBeenCalled();
  });

  it('accepts an ADMIN role while still scoping to its own identity', async () => {
    const admin = jwtService.sign({ sub: userId, role: 'ADMIN' });
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(listAsync).toHaveBeenCalledWith(userId, expect.anything());
  });

  describe('POST /api/question-bank', () => {
    const post = (body: unknown) =>
      request(app.getHttpServer())
        .post(route)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);

    it('saves a whole session and returns 201 with the counts', async () => {
      const response = await post({ sessionPublicId: sessionId }).expect(201);
      expect(response.body).toMatchObject({
        statusCode: 201,
        success: true,
        message: 'Questions saved to the question bank',
        data: { savedCount: 3, skippedCount: 1 },
      });
      expect(saveFromSessionAsync).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ sessionPublicId: sessionId }),
      );
    });

    it('forwards the selected questions and drops unknown fields', async () => {
      await post({
        sessionPublicId: sessionId,
        questionPublicIds: [questionId],
        userId: 'someone-else',
      }).expect(201);
      expect(saveFromSessionAsync).toHaveBeenCalledWith(userId, {
        sessionPublicId: sessionId,
        questionPublicIds: [questionId],
      });
    });

    it.each([
      ['sessionPublicId', {}],
      ['sessionPublicId', { sessionPublicId: 'not-a-uuid' }],
      [
        'questionPublicIds',
        { sessionPublicId: sessionId, questionPublicIds: [] },
      ],
      [
        'questionPublicIds',
        { sessionPublicId: sessionId, questionPublicIds: ['not-a-uuid'] },
      ],
      [
        'questionPublicIds',
        { sessionPublicId: sessionId, questionPublicIds: 'abc' },
      ],
      [
        'questionPublicIds',
        {
          sessionPublicId: sessionId,
          questionPublicIds: Array.from({ length: 11 }, () => questionId),
        },
      ],
    ])(
      'rejects an invalid %s before service execution',
      async (field, body) => {
        const response = await post(body).expect(400);
        expect((response.body as Record<string, unknown>).errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field })]),
        );
        expect(saveFromSessionAsync).not.toHaveBeenCalled();
      },
    );

    it.each([
      [ErrorCode.NotFound, 404],
      [ErrorCode.Conflict, 409],
      [ErrorCode.BadRequest, 400],
      [ErrorCode.InternalServerError, 500],
    ])('maps %s results to HTTP %s', async (code, status) => {
      saveFromSessionAsync.mockResolvedValue(
        err(new AppError(code, 'Operation unavailable')),
      );
      const response = await post({ sessionPublicId: sessionId }).expect(
        status,
      );
      expect(response.body).toMatchObject({ success: false, code });
    });

    it('requires authentication and rejects a VIEWER', async () => {
      await request(app.getHttpServer())
        .post(route)
        .send({ sessionPublicId: sessionId })
        .expect(401);
      const viewer = jwtService.sign({ sub: userId, role: 'VIEWER' });
      await request(app.getHttpServer())
        .post(route)
        .set('Authorization', `Bearer ${viewer}`)
        .send({ sessionPublicId: sessionId })
        .expect(403);
      expect(saveFromSessionAsync).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/question-bank/:itemPublicId', () => {
    const itemRoute = `${route}/${item.id}`;

    it('removes the item for the caller and returns 200', async () => {
      const response = await request(app.getHttpServer())
        .delete(itemRoute)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: null,
        message: 'Question removed from the question bank',
      });
      expect(deleteAsync).toHaveBeenCalledWith(userId, item.id);
    });

    it('rejects an id that is not a UUID', async () => {
      await request(app.getHttpServer())
        .delete(`${route}/not-a-uuid`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(deleteAsync).not.toHaveBeenCalled();
    });

    it('maps a service failure to a sanitized 500', async () => {
      deleteAsync.mockResolvedValue(
        err(new AppError(ErrorCode.InternalServerError, 'Failed to delete')),
      );
      await request(app.getHttpServer())
        .delete(itemRoute)
        .set('Authorization', `Bearer ${token}`)
        .expect(500);
    });

    it('requires authentication and rejects a VIEWER', async () => {
      await request(app.getHttpServer()).delete(itemRoute).expect(401);
      const viewer = jwtService.sign({ sub: userId, role: 'VIEWER' });
      await request(app.getHttpServer())
        .delete(itemRoute)
        .set('Authorization', `Bearer ${viewer}`)
        .expect(403);
      expect(deleteAsync).not.toHaveBeenCalled();
    });
  });
  describe('POST /api/interview-session/:sessionPublicId/questions/from-bank', () => {
    const route = `/api/interview-session/${sessionId}/questions/from-bank`;
    const ids = [
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3',
    ];
    const post = (body: unknown, url = route) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);

    it('sets the session questions and returns 200 with the set', async () => {
      const response = await post({ itemPublicIds: ids }).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview questions set from the question bank',
        data: { sessionPublicId: sessionId, questions: [] },
      });
      expect(useInSessionAsync).toHaveBeenCalledWith(userId, sessionId, {
        itemPublicIds: ids,
      });
    });

    it('drops unknown fields so a client cannot pick another user', async () => {
      await post({ itemPublicIds: ids, userId: 'someone-else' }).expect(200);

      expect(useInSessionAsync).toHaveBeenCalledWith(userId, sessionId, {
        itemPublicIds: ids,
      });
    });

    it.each([
      ['missing', {}],
      ['not an array', { itemPublicIds: 'abc' }],
      ['too few (2)', { itemPublicIds: ids.slice(0, 2) }],
      [
        'too many (11)',
        {
          itemPublicIds: Array.from(
            { length: 11 },
            (_, index) =>
              `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
          ),
        },
      ],
      ['repeated', { itemPublicIds: [ids[0], ids[0], ids[1]] }],
      ['not UUIDs', { itemPublicIds: [ids[0], ids[1], 'not-a-uuid'] }],
    ])('rejects itemPublicIds that are %s', async (_name, body) => {
      const response = await post(body).expect(400);

      expect((response.body as Record<string, unknown>).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'itemPublicIds' }),
        ]),
      );
      expect(useInSessionAsync).not.toHaveBeenCalled();
    });

    it('rejects a malformed session id', async () => {
      await post(
        { itemPublicIds: ids },
        '/api/interview-session/not-a-uuid/questions/from-bank',
      ).expect(400);
      expect(useInSessionAsync).not.toHaveBeenCalled();
    });

    it.each([
      [ErrorCode.NotFound, 404],
      [ErrorCode.Conflict, 409],
      [ErrorCode.InternalServerError, 500],
    ])('maps %s results to HTTP %s', async (code, status) => {
      useInSessionAsync.mockResolvedValue(
        err(new AppError(code, 'Operation unavailable')),
      );

      const response = await post({ itemPublicIds: ids }).expect(status);

      expect(response.body).toMatchObject({ success: false, code });
    });

    it('requires authentication and rejects a VIEWER', async () => {
      await request(app.getHttpServer())
        .post(route)
        .send({ itemPublicIds: ids })
        .expect(401);
      const viewer = jwtService.sign({ sub: userId, role: 'VIEWER' });
      await request(app.getHttpServer())
        .post(route)
        .set('Authorization', `Bearer ${viewer}`)
        .send({ itemPublicIds: ids })
        .expect(403);
      expect(useInSessionAsync).not.toHaveBeenCalled();
    });
  });
});
