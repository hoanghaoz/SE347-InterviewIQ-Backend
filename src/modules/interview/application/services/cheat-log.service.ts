import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { CheatLogRejectionReason } from '../../domain/errors/cheat-log.error';
import { checkCheatLogAcceptance } from '../../domain/policies/cheat-log.policy';
import {
  ICheatLogRepository,
  type CheatEventCounts,
  type SavedCheatLog,
} from '../../domain/repositories/cheat-log.repo.interface';
import type { CreateCheatLogRequestDto } from '../dtos/cheat-log.request.dto';
import type {
  CheatLogCreatedResponseDto,
  CheatLogDto,
  CheatLogListResponseDto,
  CheatSummaryDto,
} from '../dtos/cheat-log.response.dto';
import { ICheatLogService } from '../interfaces/cheat-log.service.interface';

@Injectable()
export class CheatLogService implements ICheatLogService {
  constructor(private readonly cheatLogRepo: ICheatLogRepository) {}

  async recordCheatEventAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: CreateCheatLogRequestDto,
  ): Promise<Result<CheatLogCreatedResponseDto, AppError>> {
    const session = await this.cheatLogRepo.getSessionForCheatLog(
      userPublicId,
      sessionPublicId,
    );
    if (session.isErr()) return err(internalError());
    // Không tồn tại và của người khác dùng chung 404, không bao giờ 403.
    if (session.value === null) return err(notFoundError());

    const accepted = checkCheatLogAcceptance({
      status: session.value.status,
      startedAt: session.value.startedAt,
      submittedAt: session.value.submittedAt,
      occurredAt: new Date(request.occurredAt),
      now: new Date(),
    });
    if (accepted.isErr()) {
      const { reason, message } = accepted.error;
      return err(
        new AppError(
          reason === CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE
            ? ErrorCode.BadRequest
            : ErrorCode.Conflict,
          message,
        ),
      );
    }

    const created = await this.cheatLogRepo.createCheatLog(
      session.value.sessionId,
      {
        eventType: request.eventType,
        description: request.description ?? null,
        occurredAt: new Date(request.occurredAt),
      },
    );
    if (created.isErr()) return err(internalError());

    const counts = await this.cheatLogRepo.countCheatLogsByType(
      session.value.sessionId,
    );
    if (counts.isErr()) return err(internalError());

    return ok({
      log: toCheatLogDto(created.value),
      summary: toCheatSummary(counts.value),
    });
  }

  async getCheatLogsAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<CheatLogListResponseDto, AppError>> {
    const session = await this.cheatLogRepo.getSessionForCheatLog(
      userPublicId,
      sessionPublicId,
    );
    if (session.isErr()) return err(internalError());
    if (session.value === null) return err(notFoundError());

    const [logs, counts] = await Promise.all([
      this.cheatLogRepo.getCheatLogs(session.value.sessionId),
      this.cheatLogRepo.countCheatLogsByType(session.value.sessionId),
    ]);
    if (logs.isErr() || counts.isErr()) return err(internalError());

    return ok({
      logs: logs.value.map(toCheatLogDto),
      summary: toCheatSummary(counts.value),
    });
  }
}

function notFoundError(): AppError {
  return new AppError(ErrorCode.NotFound, 'Interview session not found');
}

function internalError(): AppError {
  return new AppError(
    ErrorCode.InternalServerError,
    'Failed to process the cheat log',
  );
}

function toCheatLogDto(log: SavedCheatLog): CheatLogDto {
  return {
    id: log.publicId,
    eventType: log.eventType,
    description: log.description,
    occurredAt: log.occurredAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
  };
}

function toCheatSummary(counts: CheatEventCounts): CheatSummaryDto {
  return {
    totalCount: Object.values(counts).reduce((sum, n) => sum + n, 0),
    countsByType: counts,
  };
}
