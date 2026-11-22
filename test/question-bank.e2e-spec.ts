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
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [QuestionBankController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        { provide: IQuestionBankService, useValue: { listAsync } },
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
});
