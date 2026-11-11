import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { CommonCheatEventType } from '../domain/enums/interview-enum';
import {
  ICheatLogRepository,
  type CheatEventCounts,
  type CheatLogSessionData,
  type CreateCheatLogData,
  type SavedCheatLog,
} from '../domain/repositories/cheat-log.repo.interface';
import {
  mapCheatEventTypeToDomain,
  mapCheatEventTypeToPrisma,
} from './cheat-log.mapper';
import { mapStatusToDomain } from './interview-mapper';

const CHEAT_LOG_SELECT = {
  publicId: true,
  eventType: true,
  description: true,
  occurredAt: true,
  createdAt: true,
} as const;

@Injectable()
export class CheatLogRepository implements ICheatLogRepository {
  private readonly logger = new Logger(CheatLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSessionForCheatLog(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<CheatLogSessionData | null, Error>> {
    try {
      // findFirst: điều kiện gồm cả chủ sở hữu nên publicId của người khác trả
      // null y như publicId không tồn tại.
      const session = await this.prisma.interviewSession.findFirst({
        where: {
          publicId: sessionPublicId,
          user: { publicId: userPublicId },
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          submittedAt: true,
        },
      });
      return ok(
        session
          ? {
              sessionId: session.id,
              status: mapStatusToDomain(session.status),
              startedAt: session.startedAt,
              submittedAt: session.submittedAt,
            }
          : null,
      );
    } catch (error) {
      this.logger.error(
        `getSessionForCheatLog failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the interview session.'));
    }
  }

  async createCheatLog(
    sessionId: number,
    data: CreateCheatLogData,
  ): Promise<Result<SavedCheatLog, Error>> {
    try {
      const created = await this.prisma.cheatLog.create({
        data: {
          sessionId,
          eventType: mapCheatEventTypeToPrisma(data.eventType),
          description: data.description,
          occurredAt: data.occurredAt,
        },
        select: CHEAT_LOG_SELECT,
      });
      return ok(toSavedCheatLog(created));
    } catch (error) {
      this.logger.error(`createCheatLog failed: ${(error as Error).message}`);
      return err(new Error('Failed to create the cheat log.'));
    }
  }

  async getCheatLogs(
    sessionId: number,
  ): Promise<Result<SavedCheatLog[], Error>> {
    try {
      const logs = await this.prisma.cheatLog.findMany({
        where: { sessionId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        select: CHEAT_LOG_SELECT,
      });
      return ok(logs.map(toSavedCheatLog));
    } catch (error) {
      this.logger.error(`getCheatLogs failed: ${(error as Error).message}`);
      return err(new Error('Failed to get the cheat logs.'));
    }
  }

  async countCheatLogsByType(
    sessionId: number,
  ): Promise<Result<CheatEventCounts, Error>> {
    try {
      const groups = await this.prisma.cheatLog.groupBy({
        by: ['eventType'],
        where: { sessionId },
        _count: { _all: true },
      });
      const counts = emptyCounts();
      for (const group of groups) {
        counts[mapCheatEventTypeToDomain(group.eventType)] = group._count._all;
      }
      return ok(counts);
    } catch (error) {
      this.logger.error(
        `countCheatLogsByType failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to count the cheat logs.'));
    }
  }
}

function emptyCounts(): CheatEventCounts {
  return {
    [CommonCheatEventType.TAB_SWITCH]: 0,
    [CommonCheatEventType.WINDOW_BLUR]: 0,
    [CommonCheatEventType.FACE_MISSING]: 0,
    [CommonCheatEventType.MULTIPLE_FACES]: 0,
  };
}

function toSavedCheatLog(row: {
  publicId: string;
  eventType: Parameters<typeof mapCheatEventTypeToDomain>[0];
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
}): SavedCheatLog {
  return {
    publicId: row.publicId,
    eventType: mapCheatEventTypeToDomain(row.eventType),
    description: row.description,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}
