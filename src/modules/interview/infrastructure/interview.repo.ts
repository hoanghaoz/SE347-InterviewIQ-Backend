import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { Interview } from '../domain/entities/interview.entity';
import { IInterviewRepository } from '../domain/repositories/interview.repo.interface';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { mapStatusToPrisma } from './interview-mapper';

@Injectable()
export class InterviewRepository implements IInterviewRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createInterviewSession(
    newSession: Interview,
  ): Promise<Result<string, Error>> {
    try {
      const session = await this.prismaService.interviewSession.create({
        data: {
          title: newSession.title,
          jobDescription: newSession.jobDescription,
          status: mapStatusToPrisma(newSession.status),
          user: { connect: { publicId: newSession.userPublicId } },
          cv: {
            connect: {
              publicId: newSession.cvPublicId,
            },
          },
        },
        select: { publicId: true },
      });

      return ok(session.publicId);
    } catch {
      return err(new Error('Failed to create interview session.'));
    }
  }
}
