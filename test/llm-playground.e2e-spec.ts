import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { LlmPlaygroundController } from '../src/modules/llm-playground/api/llm-playground.controller';
import { LlmPlaygroundEnabledGuard } from '../src/modules/llm-playground/api/llm-playground-enabled.guard';
import { ILlmPlaygroundService } from '../src/modules/llm-playground/application/interfaces/llm-playground.service.interface';
import { LlmPlaygroundService } from '../src/modules/llm-playground/application/services/llm-playground.service';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { LLM_PROVIDER_LOOKUP } from '../src/shared/llm/llm.constants';
import { ILlmProvider } from '../src/shared/llm/llm.provider';

describe('LlmPlaygroundController (e2e)', () => {
  let app: INestApplication<App> | undefined;
  const generateText = jest.fn();
  const generateJson = jest.fn();
  const fakeProvider = {
    generateText,
    generateJson,
  } as unknown as ILlmProvider;
  const route = '/api/internal/llm-playground';

  async function createApp(enabled: boolean): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ENABLE_LLM_PLAYGROUND: enabled ? 'true' : 'false' })],
        }),
      ],
      controllers: [LlmPlaygroundController],
      providers: [
        LlmPlaygroundEnabledGuard,
        { provide: ILlmPlaygroundService, useClass: LlmPlaygroundService },
        { provide: ILlmProvider, useValue: fakeProvider },
        {
          provide: LLM_PROVIDER_LOOKUP,
          useValue: { gemini: fakeProvider, groq: fakeProvider },
        },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<INestApplication<App>>();
    nestApp.useGlobalFilters(new AllExceptionsFilter());
    nestApp.useGlobalPipes(
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
    await nestApp.init();
    return nestApp;
  }

  beforeEach(() => {
    generateText.mockReset();
    generateJson.mockReset();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe('when the playground is disabled', () => {
    beforeEach(async () => {
      app = await createApp(false);
    });

    it('GET responds 404', async () => {
      await request(app!.getHttpServer()).get(route).expect(404);
    });

    it('POST responds 404 even for an invalid body and never calls a vendor', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({})
        .expect(404);

      expect(generateText).not.toHaveBeenCalled();
    });
  });

  describe('when the playground is enabled', () => {
    beforeEach(async () => {
      app = await createApp(true);
    });

    it('GET serves the HTML page', async () => {
      const response = await request(app!.getHttpServer())
        .get(route)
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(response.text).toContain('<title>LLM Prompt Playground</title>');
      expect(response.text).toContain('/api/internal/llm-playground/run');
    });

    it('POST runs a text prompt and wraps the result in ApiSuccessResponse', async () => {
      generateText.mockResolvedValue(
        ok({ text: 'hi there', provider: 'groq', model: 'm', latencyMs: 9 }),
      );

      const response = await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: 'hello' })
        .expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: { output: 'hi there', provider: 'groq', model: 'm' },
      });
    });

    it('POST rejects an empty prompt with 400 before any vendor call', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: '' })
        .expect(400);

      expect(generateText).not.toHaveBeenCalled();
    });

    it('POST rejects an oversized prompt with 400 before any vendor call', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: 'a'.repeat(8001) })
        .expect(400);

      expect(generateText).not.toHaveBeenCalled();
    });

    it('POST in JSON mode without a schema responds 400', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'json', provider: 'default', prompt: 'hello' })
        .expect(400);

      expect(generateJson).not.toHaveBeenCalled();
    });

    it('POST maps a vendor failure to the error envelope without leaking causes', async () => {
      generateText.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'AI service is temporarily unavailable',
          ),
        ),
      );

      const response = await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: 'hello' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'AI service is temporarily unavailable',
      });
    });
  });
});
