import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { PaginationRequest } from '../../../shared/common/pagination';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { CommonSessionStatus } from '../../interview/domain/enums/interview-enum';
import {
  IInterviewHistoryRepository,
  InterviewHistoryDetailData,
  InterviewHistoryFilter,
  InterviewHistoryPage,
} from '../domain/repositories/interview-history.repo.interface';

// Màn danh sách: không select jobDescription (cột Text) và cvSnapshot (cột Json),
// chỉ kéo overallScore từ quan hệ score trong cùng một query nên không có N+1.
const LIST_SELECT = {
  publicId: true,
  title: true,
  status: true,
  totalQuestions: true,
  durationSeconds: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  score: { select: { overallScore: true } },
} as const;

const DETAIL_SELECT = {
  publicId: true,
  title: true,
  jobDescription: true,
  status: true,
  totalQuestions: true,
  durationSeconds: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  createdAt: true,
  cv: { select: { publicId: true, fileName: true } },
} as const;

@Injectable()
export class InterviewHistoryRepository implements IInterviewHistoryRepository {
  private readonly logger = new Logger(InterviewHistoryRepository.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getInterviewHistory(
    userPublicId: string,
    pagination: PaginationRequest,
    filter: InterviewHistoryFilter,
  ): Promise<Result<InterviewHistoryPage, Error>> {
    try {
      const { pageNumber, pageSize } = pagination;
      const where = {
        user: { publicId: userPublicId },
        ...(filter.status === undefined
          ? {}
          : { status: SessionStatus[filter.status] }),
        ...(filter.fromDate === undefined && filter.toDate === undefined
          ? {}
          : {
              createdAt: {
                ...(filter.fromDate === undefined
                  ? {}
                  : { gte: filter.fromDate }),
                // lte, không lt: mốc toDate được tính vào kết quả
                ...(filter.toDate === undefined ? {} : { lte: filter.toDate }),
              },
            }),
      };

      const [sessions, totalItems] = await Promise.all([
        this.prismaService.interviewSession.findMany({
          where,
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
          // Khớp index [userId, createdAt desc]; thêm id để thứ tự ổn định khi
          // hai buổi phỏng vấn trùng createdAt
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: LIST_SELECT,
        }),
        this.prismaService.interviewSession.count({ where }),
      ]);

      const items = sessions.map((session) => ({
        sessionPublicId: session.publicId,
        title: session.title,
        status: CommonSessionStatus[session.status],
        totalQuestions: session.totalQuestions,
        durationSeconds: session.durationSeconds,
        overallScore: session.score?.overallScore ?? null,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        createdAt: session.createdAt,
      }));

      return ok({ items, totalItems });
    } catch (error) {
      this.logger.error(
        `getInterviewHistory failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the interview history'));
    }
  }

  async getInterviewDetail(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<InterviewHistoryDetailData | null, Error>> {
    try {
      // findFirst chứ không findUnique: điều kiện gồm cả chủ sở hữu, nên một
      // publicId của người khác trả null y như publicId không tồn tại.
      const session = await this.prismaService.interviewSession.findFirst({
        where: {
          publicId: sessionPublicId,
          user: { publicId: userPublicId },
        },
        select: DETAIL_SELECT,
      });
      if (!session) {
        return ok(null);
      }

      return ok({
        sessionPublicId: session.publicId,
        title: session.title,
        jobDescription: session.jobDescription,
        status: CommonSessionStatus[session.status],
        totalQuestions: session.totalQuestions,
        durationSeconds: session.durationSeconds,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        completedAt: session.completedAt,
        createdAt: session.createdAt,
        cv: session.cv
          ? { cvPublicId: session.cv.publicId, fileName: session.cv.fileName }
          : null,
      });
    } catch (error) {
      this.logger.error(
        `getInterviewDetail failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to get the interview'));
    }
  }
}
