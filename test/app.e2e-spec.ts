import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PG_BOSS_TOKEN } from './../src/modules/scoring/infrastructure/queue/pg-boss.provider';
import { PrismaService } from './../src/shared/infrastructure/database/prisma.service';
import { RedisService } from './../src/shared/infrastructure/redis/redis.service';

// pg-boss chỉ có bản ESM nên jest (CommonJS) không load được; queue thật được thay bằng fake bên dưới
jest.mock('pg-boss', () => ({ PgBoss: class {} }));

/**
 * Smoke test: dựng toàn bộ AppModule thật để bắt lỗi wiring DI giữa các module
 * (thiếu provider, sai token...). Chỉ thay hạ tầng bên ngoài là Postgres, Redis và pg-boss,
 * nên không cần Docker.
 */
// Provider đọc các biến này lúc khởi tạo. process.env được ưu tiên hơn file .env
// nên test chạy giống nhau trên mọi máy, có hay không có .env.
const testEnv: Record<string, string> = {
  JWT_SECRET: 'e2e-test-secret',
  JWT_ACCESS_EXPIRES_IN: '900',
  JWT_REFRESH_EXPIRES_IN: '604800',
  MAIL_HOST: 'localhost',
  MAIL_PORT: '1025',
  MAIL_FROM: 'InterviewIQ <no-reply@interviewiq.local>',
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  REDIS_URL: 'redis://localhost:6379',
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const originalEnv = { ...process.env };
  const boss = {
    createQueue: jest.fn().mockResolvedValue(undefined),
    work: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue('job-id'),
    stop: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    Object.assign(process.env, testEnv);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(PG_BOSS_TOKEN)
      .useValue(boss)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  it('boots every module and answers GET /', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
