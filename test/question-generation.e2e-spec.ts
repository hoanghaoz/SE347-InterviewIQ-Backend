import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { err, ok, type Result } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { QuestionGenerationController } from '../src/modules/question-generation/api/question-generation.controller';
import { IQuestionGenerationService } from '../src/modules/question-generation/application/interfaces/question-generation.service.interface';
import { IQuestionGenerator } from '../src/modules/question-generation/application/interfaces/question-generator.interface';
import { QuestionGenerationService } from '../src/modules/question-generation/application/services/question-generation.service';
import {
  QuestionNotInSessionError,
  QuestionSetLockedError,
} from '../src/modules/question-generation/domain/errors/question-generation.error';
import {
  GeneratedQuestion,
  GenerationContext,
  IQuestionGenerationRepository,
  QuestionReplacement,
  SessionQuestions,
  StoredQuestion,
} from '../src/modules/question-generation/domain/repositories/question-generation.repo.interface';
import { LlmQuestionGenerator } from '../src/modules/question-generation/infrastructure/llm-question-generator';
import { CommonSessionStatus } from '../src/modules/interview/domain/enums/interview-enum';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { JwtAuthGuard } from '../src/shared/common/jwt.guard';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { RolesGuard } from '../src/shared/decorators/roles.guard';
import { ILlmProvider } from '../src/shared/llm/llm.provider';

const userId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const readySession = '10000000-0000-4000-8000-000000000001';
const startedSession = '10000000-0000-4000-8000-000000000002';
const unparsedSession = '10000000-0000-4000-8000-000000000003';
const unknownSession = '10000000-0000-4000-8000-000000000004';

const parsedData = {
  summary: 'Backend developer',
  skills: {
    languages: ['TypeScript'],
    frameworks: ['NestJS'],
    databases: ['PostgreSQL'],
    tools: ['Docker'],
  },
  experiences: [],
  education: [],
  projects: [],
};

type FakeSession = {
  id: number;
  ownerPublicId: string;
  context: Omit<GenerationContext, 'sessionId'>;
  questions: StoredQuestion[];
};

// Stands in for Prisma: the HTTP layer, service, generator and validator run for real.
class InMemoryQuestionGenerationRepository implements IQuestionGenerationRepository {
  sessions = new Map<string, FakeSession>();
  private nextQuestionId = 1;

  seed(): void {
    this.sessions = new Map([
      [readySession, this.build(1, CommonSessionStatus.CREATED, parsedData)],
      [
        startedSession,
        this.build(2, CommonSessionStatus.IN_PROGRESS, parsedData),
      ],
      [unparsedSession, this.build(3, CommonSessionStatus.CREATED, null)],
    ]);
  }

  private build(
    id: number,
    status: CommonSessionStatus,
    data: typeof parsedData | null,
  ): FakeSession {
    return {
      id,
      ownerPublicId: userId,
      context: {
        status,
        jobDescription: 'Looking for a NestJS developer',
        parsedData: data,
      },
      questions: [],
    };
  }

  private find(
    sessionPublicId: string,
    userPublicId: string,
  ): FakeSession | undefined {
    const session = this.sessions.get(sessionPublicId);
    return session?.ownerPublicId === userPublicId ? session : undefined;
  }

  getGenerationContext(
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<Result<GenerationContext | null, Error>> {
    const session = this.find(sessionPublicId, userPublicId);
    return Promise.resolve(
      ok(session ? { sessionId: session.id, ...session.context } : null),
    );
  }

  replaceQuestions(
    sessionId: number,
    questions: GeneratedQuestion[],
  ): Promise<Result<StoredQuestion[], Error>> {
    const session = [...this.sessions.values()].find((s) => s.id === sessionId);
    if (session?.context.status !== CommonSessionStatus.CREATED) {
      return Promise.resolve(err(new QuestionSetLockedError()));
    }
    session.questions = questions.map((question) => ({
      ...question,
      publicId: `20000000-0000-4000-8000-${String(this.nextQuestionId++).padStart(12, '0')}`,
    }));
    return Promise.resolve(ok(session.questions));
  }

  replaceQuestion(
    sessionId: number,
    questionPublicId: string,
    replacement: QuestionReplacement,
  ): Promise<Result<StoredQuestion[], Error>> {
    const session = [...this.sessions.values()].find((s) => s.id === sessionId);
    if (session?.context.status !== CommonSessionStatus.CREATED) {
      return Promise.resolve(err(new QuestionSetLockedError()));
    }
    const index = session.questions.findIndex(
      (question) => question.publicId === questionPublicId,
    );
    if (index === -1) {
      return Promise.resolve(err(new QuestionNotInSessionError()));
    }
    session.questions = session.questions.map((question, position) =>
      position === index ? { ...question, ...replacement } : question,
    );
    return Promise.resolve(ok(session.questions));
  }

  getSessionQuestions(
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<Result<SessionQuestions | null, Error>> {
    const session = this.find(sessionPublicId, userPublicId);
    return Promise.resolve(
      ok(session ? { sessionPublicId, questions: session.questions } : null),
    );
  }
}

describe('QuestionGenerationController (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const generateJson = jest.fn();
  const repository = new InMemoryQuestionGenerationRepository();
  const generateRoute = (id: string) =>
    `/api/interview-session/${id}/questions/generate`;
  const listRoute = (id: string) => `/api/interview-session/${id}/questions`;
  const regenerateRoute = (id: string, questionId: string) =>
    `/api/interview-session/${id}/questions/${questionId}/regenerate`;
  const unknownQuestion = '20000000-0000-4000-8000-0000000000ff';

  const oneQuestion = (
    content: string,
    domain = 'TECHNICAL',
    difficulty = 'MEDIUM',
  ) =>
    ok({
      provider: 'gemini' as const,
      model: 'test-model',
      latencyMs: 1,
      data: { questions: [{ content, domain, difficulty }] },
    });

  const llmQuestions = (count: number) =>
    ok({
      provider: 'gemini' as const,
      model: 'test-model',
      latencyMs: 1,
      data: {
        questions: Array.from({ length: count }, (_, index) => ({
          content: `Question ${index + 1}?`,
          domain: 'TECHNICAL',
          difficulty: 'MEDIUM',
        })),
      },
    });

  async function createApp(): Promise<void> {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({})],
        }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [QuestionGenerationController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        { provide: ILlmProvider, useValue: { generateJson } },
        { provide: IQuestionGenerator, useClass: LlmQuestionGenerator },
        {
          provide: IQuestionGenerationService,
          useClass: QuestionGenerationService,
        },
        { provide: IQuestionGenerationRepository, useValue: repository },
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
  }

  beforeEach(async () => {
    generateJson.mockReset();
    repository.seed();
    await createApp();
  });

  afterEach(async () => app.close());

  describe('POST generate', () => {
    it('generates the default 5 questions and stores them', async () => {
      generateJson.mockResolvedValue(llmQuestions(5));

      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview questions generated successfully',
        data: { sessionPublicId: readySession },
      });
      const questions = (
        response.body as { data: { questions: StoredQuestion[] } }
      ).data.questions;
      expect(questions.map((q) => q.orderIndex)).toEqual([1, 2, 3, 4, 5]);
      expect(questions[0]).toMatchObject({
        content: 'Question 1?',
        domain: 'TECHNICAL',
        difficulty: 'MEDIUM',
      });
      expect(generateJson).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining(
            'Looking for a NestJS developer',
          ) as unknown,
        }),
      );
      expect(repository.sessions.get(readySession)?.questions).toHaveLength(5);
    });

    it('honours the requested count', async () => {
      generateJson.mockResolvedValue(llmQuestions(3));

      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 3 })
        .expect(200);

      expect(
        (response.body as { data: { questions: unknown[] } }).data.questions,
      ).toHaveLength(3);
    });

    it('replaces the previous set when called again', async () => {
      generateJson.mockResolvedValueOnce(llmQuestions(5));
      generateJson.mockResolvedValueOnce(llmQuestions(3));
      const call = (body: object) =>
        request(app.getHttpServer())
          .post(generateRoute(readySession))
          .set('Authorization', `Bearer ${token}`)
          .send(body)
          .expect(200);

      await call({});
      await call({ count: 3 });

      expect(repository.sessions.get(readySession)?.questions).toHaveLength(3);
    });

    it.each([2, 11, 'five', 4.5])(
      'rejects an invalid count (%p) before calling the AI',
      async (count) => {
        const response = await request(app.getHttpServer())
          .post(generateRoute(readySession))
          .set('Authorization', `Bearer ${token}`)
          .send({ count })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          code: 'BAD_REQUEST',
          errors: [{ field: 'count' }],
        });
        expect(generateJson).not.toHaveBeenCalled();
      },
    );

    it('rejects a malformed session id', async () => {
      await request(app.getHttpServer())
        .post(generateRoute('not-a-uuid'))
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .expect(401);
    });

    it('returns 404 for an unknown session', async () => {
      const response = await request(app.getHttpServer())
        .post(generateRoute(unknownSession))
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it("returns the same 404 for another user's session", async () => {
      const other = Test.createTestingModule({
        imports: [JwtModule.register({ secret: 'test-secret' })],
      });
      const otherToken = (await other.compile())
        .get(JwtService)
        .sign({ sub: otherUserId, role: 'USER' });

      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        message: 'Interview session not found or unavailable',
      });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('returns 409 once the session has started', async () => {
      const response = await request(app.getHttpServer())
        .post(generateRoute(startedSession))
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'CONFLICT',
        message: 'Questions can only be generated while the session is CREATED',
      });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('returns 409 when the CV has not been parsed', async () => {
      const response = await request(app.getHttpServer())
        .post(generateRoute(unparsedSession))
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'CONFLICT',
        message: 'CV has not been parsed yet',
      });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('passes the requested domain and difficulty to the model', async () => {
      generateJson.mockResolvedValue(llmQuestions(3));

      await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 3, domain: 'TECHNICAL', difficulty: 'MEDIUM' })
        .expect(200);

      expect(generateJson).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining(
            'Every question must have the domain TECHNICAL and the difficulty MEDIUM.',
          ) as unknown,
        }),
      );
    });

    it.each([
      ['domain', 'HOBBY'],
      ['difficulty', 'EXTREME'],
    ])('rejects an invalid %s before calling the AI', async (field, value) => {
      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .send({ [field]: value })
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'BAD_REQUEST',
        errors: [{ field }],
      });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('returns a generic 500 when the model ignores the requested domain', async () => {
      generateJson.mockResolvedValue(llmQuestions(3));

      await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 3, domain: 'BEHAVIORAL' })
        .expect(500);

      expect(generateJson).toHaveBeenCalledTimes(2);
      expect(repository.sessions.get(readySession)?.questions).toHaveLength(0);
    });

    it('returns a generic 500 when the AI output stays invalid', async () => {
      generateJson.mockResolvedValue(llmQuestions(2));

      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(generateJson).toHaveBeenCalledTimes(2);
      expect(response.body).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate interview questions',
      });
      expect(repository.sessions.get(readySession)?.questions).toHaveLength(0);
    });

    it('does not leak the AI provider error', async () => {
      generateJson.mockResolvedValue(
        err(
          new AppError(ErrorCode.TooManyRequests, 'quota exceeded for key x'),
        ),
      );

      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(JSON.stringify(response.body)).not.toContain('quota');
    });
  });

  describe('POST regenerate', () => {
    async function generateSet(): Promise<StoredQuestion[]> {
      generateJson.mockResolvedValueOnce(llmQuestions(3));
      const response = await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 3 })
        .expect(200);
      return (response.body as { data: { questions: StoredQuestion[] } }).data
        .questions;
    }
    const regenerate = (sessionId: string, questionId: string) =>
      request(app.getHttpServer())
        .post(regenerateRoute(sessionId, questionId))
        .set('Authorization', `Bearer ${token}`);

    it('rewrites one question in place and returns the whole set', async () => {
      const [first, second, third] = await generateSet();
      generateJson.mockReset();
      generateJson.mockResolvedValue(oneQuestion('A fresh question?'));

      const response = await regenerate(readySession, second.publicId).expect(
        200,
      );

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Interview question regenerated successfully',
        data: { sessionPublicId: readySession },
      });
      const questions = (
        response.body as { data: { questions: StoredQuestion[] } }
      ).data.questions;
      expect(questions.map((q) => q.publicId)).toEqual([
        first.publicId,
        second.publicId,
        third.publicId,
      ]);
      expect(questions.map((q) => q.content)).toEqual([
        'Question 1?',
        'A fresh question?',
        'Question 3?',
      ]);
      expect(questions.map((q) => q.orderIndex)).toEqual([1, 2, 3]);
    });

    it('keeps the question shape and tells the model what to avoid', async () => {
      const [, second] = await generateSet();
      generateJson.mockReset();
      generateJson.mockResolvedValue(oneQuestion('A fresh question?'));

      await regenerate(readySession, second.publicId).expect(200);

      expect(generateJson).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining(
            'Every question must have the domain TECHNICAL and the difficulty MEDIUM.',
          ) as unknown,
          prompt: expect.stringContaining(
            '<existing_questions>\n- Question 1?\n- Question 2?\n- Question 3?\n</existing_questions>',
          ) as unknown,
        }),
      );
    });

    it('honours a requested domain and difficulty', async () => {
      const [first] = await generateSet();
      generateJson.mockReset();
      generateJson.mockResolvedValue(
        oneQuestion('Tell me about a conflict?', 'BEHAVIORAL', 'HARD'),
      );

      const response = await regenerate(readySession, first.publicId)
        .send({ domain: 'BEHAVIORAL', difficulty: 'HARD' })
        .expect(200);

      const questions = (
        response.body as { data: { questions: StoredQuestion[] } }
      ).data.questions;
      expect(questions[0]).toMatchObject({
        publicId: first.publicId,
        domain: 'BEHAVIORAL',
        difficulty: 'HARD',
      });
    });

    it('returns a generic 500 and keeps the old question when the model repeats an existing one', async () => {
      const [first] = await generateSet();
      generateJson.mockReset();
      generateJson.mockResolvedValue(oneQuestion('question 3?'));

      const response = await regenerate(readySession, first.publicId).expect(
        500,
      );

      expect(generateJson).toHaveBeenCalledTimes(2);
      expect(response.body).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate interview questions',
      });
      expect(
        repository.sessions.get(readySession)?.questions.map((q) => q.content),
      ).toEqual(['Question 1?', 'Question 2?', 'Question 3?']);
    });

    it('returns 404 for a question that is not in the session', async () => {
      await generateSet();
      generateJson.mockReset();

      const response = await regenerate(readySession, unknownQuestion).expect(
        404,
      );

      expect(response.body).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Interview question not found or unavailable',
      });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown session', async () => {
      await regenerate(unknownSession, unknownQuestion).expect(404);
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('returns 409 once the session has started', async () => {
      const response = await regenerate(startedSession, unknownQuestion).expect(
        409,
      );

      expect(response.body).toMatchObject({ code: 'CONFLICT' });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('returns 409 when the CV has not been parsed', async () => {
      const response = await regenerate(
        unparsedSession,
        unknownQuestion,
      ).expect(409);

      expect(response.body).toMatchObject({
        message: 'CV has not been parsed yet',
      });
    });

    it.each([
      ['a malformed session id', 'not-a-uuid', unknownQuestion],
      ['a malformed question id', readySession, 'not-a-uuid'],
    ])('rejects %s', async (_name, sessionId, questionId) => {
      await regenerate(sessionId, questionId).expect(400);
      expect(generateJson).not.toHaveBeenCalled();
    });

    it.each([
      ['domain', 'HOBBY'],
      ['difficulty', 'EXTREME'],
    ])('rejects an invalid %s before calling the AI', async (field, value) => {
      const response = await regenerate(readySession, unknownQuestion)
        .send({ [field]: value })
        .expect(400);

      expect(response.body).toMatchObject({ errors: [{ field }] });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post(regenerateRoute(readySession, unknownQuestion))
        .expect(401);
    });
  });

  describe('GET questions', () => {
    it('returns the generated questions in order', async () => {
      generateJson.mockResolvedValue(llmQuestions(4));
      await request(app.getHttpServer())
        .post(generateRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .send({ count: 4 })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(listRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Interview questions retrieved successfully',
        data: { sessionPublicId: readySession },
      });
      expect(
        (response.body as { data: { questions: unknown[] } }).data.questions,
      ).toHaveLength(4);
    });

    it('returns an empty list before any generation', async () => {
      const response = await request(app.getHttpServer())
        .get(listRoute(readySession))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        (response.body as { data: { questions: unknown[] } }).data.questions,
      ).toEqual([]);
    });

    it('returns 404 for an unknown session', async () => {
      await request(app.getHttpServer())
        .get(listRoute(unknownSession))
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
