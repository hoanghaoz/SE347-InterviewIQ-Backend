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
      .mockResolvedValue({ id: 3, userId: 1, cvId: 2 });
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
      expect(result).toEqual(ok(undefined));
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
});
