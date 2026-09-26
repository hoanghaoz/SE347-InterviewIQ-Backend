import { SessionStatus } from '../../../../generated/prisma/enums';
import { CommonSessionStatus } from '../domain/enums/interview-enum';

const statusToPrisma: Record<CommonSessionStatus, SessionStatus> = {
  [CommonSessionStatus.CREATED]: SessionStatus.CREATED,
  [CommonSessionStatus.IN_PROGRESS]: SessionStatus.IN_PROGRESS,
  [CommonSessionStatus.SUBMITTED]: SessionStatus.SUBMITTED,
  [CommonSessionStatus.SCORING]: SessionStatus.SCORING,
  [CommonSessionStatus.COMPLETED]: SessionStatus.COMPLETED,
  [CommonSessionStatus.FAILED]: SessionStatus.FAILED,
  [CommonSessionStatus.CANCELLED]: SessionStatus.CANCELLED,
};

const statusToDomain: Record<SessionStatus, CommonSessionStatus> = {
  [SessionStatus.CREATED]: CommonSessionStatus.CREATED,
  [SessionStatus.IN_PROGRESS]: CommonSessionStatus.IN_PROGRESS,
  [SessionStatus.SUBMITTED]: CommonSessionStatus.SUBMITTED,
  [SessionStatus.SCORING]: CommonSessionStatus.SCORING,
  [SessionStatus.COMPLETED]: CommonSessionStatus.COMPLETED,
  [SessionStatus.FAILED]: CommonSessionStatus.FAILED,
  [SessionStatus.CANCELLED]: CommonSessionStatus.CANCELLED,
};

export function mapStatusToPrisma(status: CommonSessionStatus): SessionStatus {
  return statusToPrisma[status];
}

export function mapStatusToDomain(status: SessionStatus): CommonSessionStatus {
  return statusToDomain[status];
}
