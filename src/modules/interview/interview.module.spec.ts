import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { PrismaModule } from '../../shared/infrastructure/database/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { PG_BOSS_TOKEN } from '../scoring/infrastructure/queue/pg-boss.provider';
import { IScoringService } from '../scoring/application/interfaces/scoring.service.interface';
import { IInterviewService } from './application/interfaces/interview.service.interface';
import { InterviewService } from './application/services/interview.service';
import { IInterviewRepository } from './domain/repositories/interview.repo.interface';
import { InterviewRepository } from './infrastructure/interview.repo';
import { InterviewModule } from './interview.module';
import { IInterviewAnswerService } from './application/interfaces/interview-answer.service.interface';
import { IInterviewVideoStorage } from './application/interfaces/interview-video-storage.interface';

jest.mock('../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('../cv/infrastructure/cv.repo', () => {
  const { ok } = jest.requireActual<typeof import('neverthrow')>('neverthrow');
  return {
    CvRepository: class {
      authorizeUserCv = jest.fn().mockResolvedValue(
        ok({
          userId: 1,
          cvId: 2,
          snapshot: {
            sourceCvPublicId: 'cv-public-id',
            fileName: 'cv.pdf',
            fileUrl: 'https://example.com/cv.pdf',
            fileSize: 1024,
            rawText: null,
            parsedData: null,
            parserVersion: null,
          },
        }),
      );
    },
  };
});
jest.mock('pg-boss', () => ({ PgBoss: class {} }));

describe('InterviewModule', () => {
  it('resolves the existing providers and enqueues through the exported scoring service', async () => {
    const boss = {
      createQueue: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue('job-id'),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 3, userId: 1, cvId: 2, status: 'IN_PROGRESS' });
    const update = jest
      .fn()
      .mockResolvedValue({ publicId: 'session-public-id' });
    const prisma = {
      interviewSession: { findUnique, update },
    };
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'test-secret' })],
        }),
        PrismaModule,
        InterviewModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PG_BOSS_TOKEN)
      .useValue(boss)
      .compile();
    try {
      await module.init();
      const service = module.get(IInterviewService);
      expect(service).toBeInstanceOf(InterviewService);
      expect(module.get(IInterviewRepository)).toBeInstanceOf(
        InterviewRepository,
      );
      expect(module.get(IScoringService)).toBeDefined();
      const result = await service.submitInterviewSessionAsync(
        'user-public-id',
        'session-public-id',
        {
          cvPublicId: 'cv-public-id',
          totalQuestions: 5,
          durationSeconds: 120,
        },
      );
      expect(result).toEqual(
        ok({
          sessionPublicId: 'session-public-id',
          jobId: 'job-id',
          status: 'QUEUED',
        }),
      );
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cvSnapshot: {
              sourceCvPublicId: 'cv-public-id',
              fileName: 'cv.pdf',
              fileUrl: 'https://example.com/cv.pdf',
              fileSize: 1024,
              rawText: null,
              parsedData: null,
              parserVersion: null,
            },
          }) as unknown,
        }),
      );
      expect(boss.send).toHaveBeenCalledWith(
        'scoring-jobs',
        {
          sessionId: 'session-public-id',
          userId: 'user-public-id',
          enqueuedAt: expect.any(String) as unknown,
        },
        expect.objectContaining({ singletonKey: 'session-public-id' }),
      );
    } finally {
      await module.close();
    }
  });
  it('resolves the video and answer providers and saves an answer without enqueueing scoring', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const questionId = '00000000-0000-4000-8000-000000000003';
    const video = {
      url: 'https://res.cloudinary.com/demo/video/upload/v1/answer.webm',
      format: 'webm',
      bytes: 1024,
      durationSeconds: 12.25,
      width: 640,
      height: 480,
    };
    const boss = {
      createQueue: jest.fn(),
      work: jest.fn(),
      send: jest.fn(),
      stop: jest.fn(),
    };
    const upsert = jest.fn().mockResolvedValue({
      publicId: 'answer-id',
      createdAt: new Date('2026-10-12T10:00:00Z'),
      updatedAt: new Date('2026-10-12T10:00:00Z'),
    });
    const tx = {
      interviewSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 3, userId: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      question: { findUnique: jest.fn().mockResolvedValue({ id: 4 }) },
      answer: { upsert },
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ session: { status: 'CREATED' } }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const storage: IInterviewVideoStorage = {
      createSignedUpload: jest.fn((cloudinaryPublicId: string) =>
        ok({
          uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
          cloudinaryPublicId,
          apiKey: 'key',
          timestamp: 123,
          signature: 'signature',
          resourceType: 'video' as const,
          allowedFormats: 'mp4,webm',
          overwrite: false as const,
          maxFileSizeBytes: 104857600,
        }),
      ),
      getVideo: jest.fn().mockResolvedValue(ok(video)),
    };
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'test-secret' })],
        }),
        PrismaModule,
        InterviewModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PG_BOSS_TOKEN)
      .useValue(boss)
      .overrideProvider(IInterviewVideoStorage)
      .useValue(storage)
      .compile();
    try {
      await module.init();
      const service = module.get(IInterviewAnswerService);
      const signed = await service.createSignedParamsAsync(
        userId,
        sessionId,
        questionId,
      );
      if (signed.isErr()) throw signed.error;
      const saved = await service.saveAnswerAsync(
        userId,
        sessionId,
        questionId,
        {
          cloudinaryPublicId: signed.value.cloudinaryPublicId,
          transcript: 'My answer',
        },
      );
      if (saved.isErr()) throw saved.error;
      expect(saved.value).toMatchObject({
        publicId: 'answer-id',
        questionPublicId: questionId,
        videoUrl: video.url,
        durationSeconds: 13,
        transcript: 'My answer',
      });
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(boss.send).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
