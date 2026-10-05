import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import { Job, PgBoss } from 'pg-boss';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import { PG_BOSS_TOKEN } from './pg-boss.provider';
import { SCORING_QUEUE_NAME } from './scoring-queue.service';

@Injectable()
export class ScoringWorkerService implements OnModuleInit {
  private readonly logger = new Logger(ScoringWorkerService.name);

  constructor(
    @Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss,
    private readonly prisma: PrismaService,
    // private readonly llmProvider: ILlmProvider, // Sprint 4: inject when ready
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.work<ScoringJobData>(
      SCORING_QUEUE_NAME,
      { localConcurrency: 2 },
      async (jobs: Job<ScoringJobData>[]) => {
        for (const job of jobs) {
          await this.handleJob(job);
        }
      },
    );
    this.logger.log(
      `Scoring worker subscribed to queue '${SCORING_QUEUE_NAME}' with concurrency 2`,
    );
  }

  async handleJob(job: Job<ScoringJobData>): Promise<void> {
    const { sessionId, userId } = job.data;
    this.logger.log(
      `Processing scoring job ${job.id} for session ${sessionId} (user: ${userId})`,
    );

    try {
      // 1. Load session + questions + answers + cv from DB
      const session = await this.prisma.interviewSession.findUnique({
        where: { publicId: sessionId },
        include: {
          cv: true,
          questions: {
            include: {
              answer: true,
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!session) {
        this.logger.warn(`Session '${sessionId}' not found for job ${job.id}`);
        return;
      }

      // 2. Load CV parsed data and cast to CvParsedData
      let cvParsedData: CvParsedData | null = null;
      if (session.cv?.parsedData) {
        cvParsedData = session.cv.parsedData as unknown as CvParsedData;
        this.logger.debug(
          `CV loaded for candidate: ${cvParsedData.skills.languages.length} languages, ${cvParsedData.experiences.length} experiences`,
        );
      }

      // 3. Mark session as SCORING
      await this.prisma.interviewSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.SCORING },
      });

      // 4. Scoring logic (placeholder for Sprint 3 — LLM Provider will be integrated in Sprint 4)
      const contentScore = 8.0;
      const relevanceScore = 7.5;
      const confidenceScore = 7.0;
      const overallScore = Number(
        (
          contentScore * 0.4 +
          relevanceScore * 0.4 +
          confidenceScore * 0.2
        ).toFixed(1),
      );

      // 5. Transaction: Save Score, InterviewSummary, and update InterviewSession status to COMPLETED
      await this.prisma.$transaction(async (tx) => {
        await tx.score.upsert({
          where: { sessionId: session.id },
          create: {
            sessionId: session.id,
            contentScore,
            relevanceScore,
            confidenceScore,
            overallScore,
            scoredAt: new Date(),
          },
          update: {
            contentScore,
            relevanceScore,
            confidenceScore,
            overallScore,
            scoredAt: new Date(),
          },
        });

        await tx.interviewSummary.upsert({
          where: { sessionId: session.id },
          create: {
            sessionId: session.id,
            overallFeedback:
              'Ứng viên thể hiện kiến thức nền tảng tốt, tư duy giải quyết vấn đề mạch lạc và tự tin.',
            strengths: [
              {
                category: 'TECHNICAL_KNOWLEDGE',
                title: 'Nắm vững kiến thức chuyên môn',
                description:
                  'Hiểu rõ các nguyên lý thiết kế và mô hình kiến trúc.',
              },
            ],
            improvements: [
              {
                category: 'COMMUNICATION',
                title: 'Trình bày súc tích và có cấu trúc hơn',
                description:
                  'Nên đi thẳng vào kết quả trước khi mô tả chi tiết quá trình.',
                suggestion:
                  'Áp dụng mô hình STAR (Situation, Task, Action, Result).',
              },
            ],
            scoringModel: 'gemini-2.5-flash',
            promptVersion: 'v1.0',
            generatedAt: new Date(),
          },
          update: {
            overallFeedback:
              'Ứng viên thể hiện kiến thức nền tảng tốt, tư duy giải quyết vấn đề mạch lạc và tự tin.',
            strengths: [
              {
                category: 'TECHNICAL_KNOWLEDGE',
                title: 'Nắm vững kiến thức chuyên môn',
                description:
                  'Hiểu rõ các nguyên lý thiết kế và mô hình kiến trúc.',
              },
            ],
            improvements: [
              {
                category: 'COMMUNICATION',
                title: 'Trình bày súc tích và có cấu trúc hơn',
                description:
                  'Nên đi thẳng vào kết quả trước khi mô tả chi tiết quá trình.',
                suggestion:
                  'Áp dụng mô hình STAR (Situation, Task, Action, Result).',
              },
            ],
            scoringModel: 'gemini-2.5-flash',
            promptVersion: 'v1.0',
            generatedAt: new Date(),
          },
        });

        await tx.interviewSession.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      });

      this.logger.log(
        `Scoring job ${job.id} completed for session ${sessionId} with score ${overallScore}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process scoring job ${job.id} for session ${sessionId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
