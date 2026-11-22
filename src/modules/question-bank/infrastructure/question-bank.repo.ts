import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import {
  QuestionDifficulty as PrismaQuestionDifficulty,
  QuestionDomain as PrismaQuestionDomain,
} from '../../../../generated/prisma/enums';
import type { PaginationRequest } from '../../../shared/common/pagination';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../question-generation/domain/enums/question.enum';
import {
  QuestionBankFullError,
  QuestionBankUnavailableError,
} from '../domain/errors/question-bank.error';
import {
  IQuestionBankRepository,
  type AddItemsResult,
  type NewQuestionBankItem,
  type QuestionBankFilter,
  type QuestionBankPage,
  type SessionQuestionData,
} from '../domain/repositories/question-bank.repo.interface';

// Prisma truyền `contains` vào LIKE mà không thoát `%` và `_`, nên tìm "100%" sẽ khớp mọi câu
// bắt đầu bằng "100". Thoát cả dấu `\` để chuỗi người dùng nhập luôn được hiểu theo nghĩa đen.
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class QuestionBankRepository implements IQuestionBankRepository {
  private readonly logger = new Logger(QuestionBankRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async listItems(
    userPublicId: string,
    pagination: PaginationRequest,
    filter: QuestionBankFilter,
  ): Promise<Result<QuestionBankPage, Error>> {
    try {
      const { pageNumber, pageSize } = pagination;
      const where = {
        user: { publicId: userPublicId },
        ...(filter.domain === undefined
          ? {}
          : { domain: PrismaQuestionDomain[filter.domain] }),
        ...(filter.difficulty === undefined
          ? {}
          : { difficulty: PrismaQuestionDifficulty[filter.difficulty] }),
        ...(filter.search === undefined
          ? {}
          : {
              content: {
                contains: escapeLikePattern(filter.search),
                mode: 'insensitive' as const,
              },
            }),
      };

      const [rows, totalItems] = await Promise.all([
        this.prisma.questionBankItem.findMany({
          where,
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
          // Khớp index [userId, createdAt desc]; thêm id để thứ tự ổn định khi trùng createdAt.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            publicId: true,
            content: true,
            domain: true,
            difficulty: true,
            createdAt: true,
          },
        }),
        this.prisma.questionBankItem.count({ where }),
      ]);

      return ok({
        items: rows.map((row) => ({
          publicId: row.publicId,
          content: row.content,
          domain: QuestionDomain[row.domain],
          difficulty: QuestionDifficulty[row.difficulty],
          createdAt: row.createdAt,
        })),
        totalItems,
      });
    } catch (error) {
      this.logger.error(`listItems failed: ${(error as Error).message}`);
      return err(new Error('Failed to list the question bank'));
    }
  }

  async getSessionQuestions(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<SessionQuestionData[] | null, Error>> {
    try {
      const session = await this.prisma.interviewSession.findFirst({
        where: {
          publicId: sessionPublicId,
          user: { publicId: userPublicId },
        },
        select: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            select: {
              publicId: true,
              content: true,
              domain: true,
              difficulty: true,
            },
          },
        },
      });
      if (!session) return ok(null);
      return ok(
        session.questions.map((question) => ({
          publicId: question.publicId,
          content: question.content,
          domain: QuestionDomain[question.domain],
          difficulty: QuestionDifficulty[question.difficulty],
        })),
      );
    } catch (error) {
      this.logger.error(
        `getSessionQuestions failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to load the session questions'));
    }
  }

  async addItems(
    userPublicId: string,
    items: NewQuestionBankItem[],
    maxItems: number,
  ): Promise<Result<AddItemsResult, Error>> {
    try {
      // Cùng nội dung trong một yêu cầu chỉ được lưu một lần.
      const unique = [
        ...new Map(items.map((item) => [item.contentHash, item])).values(),
      ];
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { publicId: userPublicId },
          select: { id: true },
        });
        if (!user) throw new QuestionBankUnavailableError();
        // Khóa hàng người dùng đến khi giao dịch kết thúc: yêu cầu lưu song song của cùng
        // người dùng phải chờ, nên phép đếm bên dưới không bị vượt giới hạn do chạy đua.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;

        const existing = await tx.questionBankItem.findMany({
          where: {
            userId: user.id,
            contentHash: { in: unique.map((item) => item.contentHash) },
          },
          select: { contentHash: true },
        });
        const known = new Set(existing.map((row) => row.contentHash));
        const fresh = unique.filter((item) => !known.has(item.contentHash));

        const total = await tx.questionBankItem.count({
          where: { userId: user.id },
        });
        if (total + fresh.length > maxItems) {
          throw new QuestionBankFullError(maxItems);
        }
        if (fresh.length > 0) {
          await tx.questionBankItem.createMany({
            data: fresh.map((item) => ({
              userId: user.id,
              content: item.content,
              contentHash: item.contentHash,
              domain: PrismaQuestionDomain[item.domain],
              difficulty: PrismaQuestionDifficulty[item.difficulty],
            })),
            skipDuplicates: true,
          });
        }
        return {
          savedCount: fresh.length,
          skippedCount: items.length - fresh.length,
        };
      });
      return ok(result);
    } catch (error) {
      if (
        error instanceof QuestionBankFullError ||
        error instanceof QuestionBankUnavailableError
      ) {
        return err(error);
      }
      this.logger.error(`addItems failed: ${(error as Error).message}`);
      return err(new Error('Failed to save to the question bank'));
    }
  }

  async deleteItem(
    userPublicId: string,
    itemPublicId: string,
  ): Promise<Result<void, Error>> {
    try {
      // deleteMany (not delete) so an item that is already gone is not an error.
      await this.prisma.questionBankItem.deleteMany({
        where: { publicId: itemPublicId, user: { publicId: userPublicId } },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(`deleteItem failed: ${(error as Error).message}`);
      return err(new Error('Failed to delete the question'));
    }
  }
}
