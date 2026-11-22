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
  IQuestionBankRepository,
  type QuestionBankFilter,
  type QuestionBankPage,
} from '../domain/repositories/question-bank.repo.interface';

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
                contains: filter.search,
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
}
