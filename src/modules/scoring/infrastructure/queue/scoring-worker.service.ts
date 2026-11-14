import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import type { Job, PgBoss } from 'pg-boss';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import { IScoringLlmProvider } from '../../application/interfaces/scoring-llm.interface';
import {
  ScoringDomainError,
  ScoringDomainErrorValidation,
} from '../../domain/errors/scoring-domain.error';
import {
  InterviewSummary,
  Score,
} from '../../domain/entities/scoring-job.entity';
import { IScoringRepository } from '../../domain/repositories/scoring.repo.interface';
import { PG_BOSS_TOKEN } from './pg-boss.provider';
import { SCORING_QUEUE_NAME } from './scoring-queue.service';

@Injectable()
export class ScoringWorkerService implements OnModuleInit {
  private readonly logger = new Logger(ScoringWorkerService.name);
  private readonly concurrency: number;
  private readonly defaultRetryLimit: number;
  private readonly pacingMs: number;
  private lastJobCompletedAt = 0;

  constructor(
    @Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss,
    private readonly scoringRepo: IScoringRepository,
    @Inject(IScoringLlmProvider)
    private readonly llmProvider: IScoringLlmProvider,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.concurrency =
      Number(
        this.configService?.get<number | string>(
          'SCORING_WORKER_CONCURRENCY',
          2,
        ),
      ) || 2;
    this.defaultRetryLimit =
      Number(
        this.configService?.get<number | string>('SCORING_JOB_RETRY_LIMIT', 3),
      ) || 3;
    const rawPacing = this.configService?.get<number | string>(
      'SCORING_WORKER_PACING_MS',
    );
    this.pacingMs =
      rawPacing !== undefined
        ? Number(rawPacing)
        : process.env.NODE_ENV === 'test'
          ? 0
          : 2000;
  }

  async onModuleInit(): Promise<void> {
    await this.boss.createQueue(SCORING_QUEUE_NAME);
    await this.boss.work<ScoringJobData>(
      SCORING_QUEUE_NAME,
      { localConcurrency: this.concurrency },
      async (jobs: Job<ScoringJobData>[]) => {
        for (const job of jobs) {
          await this.applyPacingDelay();
          await this.handleJob(job);
        }
      },
    );
    this.logger.log(
      `Scoring worker subscribed to queue '${SCORING_QUEUE_NAME}' with concurrency ${this.concurrency} (pacing: ${this.pacingMs}ms)`,
    );
  }

  async handleJob(job: Job<ScoringJobData>): Promise<void> {
    const { sessionId, userId } = job.data;
    const jobAny = job as Record<string, any>;
    const retryCount = Number(jobAny.retrycount ?? jobAny.retryCount ?? 0);
    const retryLimit = Number(
      jobAny.retrylimit ?? jobAny.retryLimit ?? this.defaultRetryLimit,
    );

    this.logger.log(
      `Processing scoring job ${job.id} for session ${sessionId} (user: ${userId}) [retry: ${retryCount}/${retryLimit}]`,
    );

    let sessionDbId: number | null = null;

    try {
      const sessionResult =
        await this.scoringRepo.findSessionForScoring(sessionId);
      if (sessionResult.isErr()) {
        this.logger.error(
          `Failed to load session context: ${sessionResult.error.message}`,
        );
        throw sessionResult.error;
      }

      const session = sessionResult.value;
      if (!session) {
        this.logger.warn(`Session '${sessionId}' not found for job ${job.id}`);
        return;
      }

      if (
        session.status === SessionStatus.COMPLETED ||
        session.status === SessionStatus.CANCELLED
      ) {
        this.logger.warn(
          `Session '${sessionId}' is already in terminal status '${session.status}' for job ${job.id}. Skipping scoring safely.`,
        );
        return;
      }

      sessionDbId = session.id;

      if (session.cvParsedData) {
        this.logger.debug(
          `CV loaded for candidate: ${session.cvParsedData.skills.languages.length} languages, ${session.cvParsedData.experiences.length} experiences`,
        );
      }

      const updateStatusResult = await this.scoringRepo.updateSessionStatus(
        session.id,
        SessionStatus.SCORING,
      );
      if (updateStatusResult.isErr()) {
        this.logger.error(
          `Failed to update session status to SCORING: ${updateStatusResult.error.message}`,
        );
        throw updateStatusResult.error;
      }

      if (!this.llmProvider) {
        throw new ScoringDomainErrorValidation(
          ScoringDomainError.InvalidRubricPayload,
          'IScoringLlmProvider is not configured for ScoringWorkerService.',
        );
      }

      this.logger.log(
        `Invoking IScoringLlmProvider for session ${sessionId} evaluation...`,
      );
      const evalResult = await this.llmProvider.evaluateSession({
        sessionPublicId: session.publicId,
        title: session.title,
        jobDescription: session.jobDescription,
        cvParsedData: session.cvParsedData,
        questions: session.questions.map((q) => ({
          content: q.content,
          orderIndex: q.orderIndex,
          domain: q.domain,
          difficulty: q.difficulty,
          transcript: q.answer?.transcript ?? null,
          emotionSummary: q.answer?.emotionSummary ?? null,
          durationSeconds: q.answer?.durationSeconds ?? null,
        })),
      });

      if (evalResult.isErr()) {
        this.logger.error(
          `LLM evaluation failed for session ${sessionId}: ${evalResult.error.message}`,
        );
        throw evalResult.error;
      }

      const evaluation = evalResult.value;

      const scoreResult = Score.create({
        sessionId: session.id,
        contentScore: evaluation.contentScore,
        relevanceScore: evaluation.relevanceScore,
        confidenceScore: evaluation.confidenceScore,
        overallScore: evaluation.overallScore,
      });
      if (scoreResult.isErr()) {
        throw scoreResult.error;
      }
      const score = scoreResult.value;

      const summaryResult = InterviewSummary.create({
        sessionId: session.id,
        overallFeedback: evaluation.overallFeedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        scoringModel: evaluation.scoringModel,
        promptVersion: evaluation.promptVersion,
        generatedAt: new Date(),
      });
      if (summaryResult.isErr()) {
        throw summaryResult.error;
      }
      const summary = summaryResult.value;

      const saveResult = await this.scoringRepo.saveScoringResult(
        session.id,
        score,
        summary,
      );
      if (saveResult.isErr()) {
        this.logger.error(
          `Failed to save scoring result: ${saveResult.error.message}`,
        );
        throw saveResult.error;
      }

      this.logger.log(
        `Scoring job ${job.id} completed for session ${sessionId} ` +
          `[overallScore=${score.overallScore}, model=${summary.scoringModel}, promptVersion=${summary.promptVersion ?? 'n/a'}, ` +
          `provider=${evaluation.provider ?? 'n/a'}, latencyMs=${evaluation.latencyMs ?? 0}, ` +
          `inputTokens=${evaluation.inputTokens ?? 0}, outputTokens=${evaluation.outputTokens ?? 0}]`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to process scoring job ${job.id} for session ${sessionId} [retry: ${retryCount}/${retryLimit}]: ${err.message}`,
        err.stack,
      );

      if (sessionDbId !== null) {
        const isNonRetryable = this.isNonRetryableError(error);
        const isLastAttempt = retryCount + 1 >= retryLimit;

        if (isNonRetryable || isLastAttempt) {
          const failureReason = err.message || 'Scoring job processing failed';
          const markResult = await this.scoringRepo.markSessionFailed(
            sessionDbId,
            failureReason,
          );
          if (markResult.isErr()) {
            this.logger.error(
              `Failed to mark session ${sessionDbId} as FAILED: ${markResult.error.message}`,
            );
          }
        }
      }

      throw error;
    } finally {
      this.lastJobCompletedAt = Date.now();
    }
  }

  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof ScoringDomainErrorValidation) {
      return true;
    }
    if (error instanceof AppError) {
      return error.code === ErrorCode.BadRequest;
    }
    if (error instanceof Error) {
      if (
        error.name === 'ScoringDomainErrorValidation' ||
        error.name === 'ValidationError'
      ) {
        return true;
      }
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'isNonRetryable' in error &&
      (error as Record<string, unknown>).isNonRetryable === true
    ) {
      return true;
    }
    return false;
  }

  private async applyPacingDelay(): Promise<void> {
    if (this.pacingMs <= 0) {
      return;
    }
    const now = Date.now();
    const elapsedSinceLastJob = now - this.lastJobCompletedAt;
    if (this.lastJobCompletedAt > 0 && elapsedSinceLastJob < this.pacingMs) {
      const waitTime = this.pacingMs - elapsedSinceLastJob;
      this.logger.debug(
        `Applying pacing delay of ${waitTime}ms to protect AI rate limits`,
      );
      await this.delay(waitTime);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
