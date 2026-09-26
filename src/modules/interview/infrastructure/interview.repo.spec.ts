import { Interview } from '../domain/entities/interview.entity';
import { CommonSessionStatus } from '../domain/enums/interview-enum';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { InterviewRepository } from './interview.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('InterviewRepository', () => {
  const create = jest.fn();
  const prisma = {
    interviewSession: { create },
  } as unknown as PrismaService;
  const repository = new InterviewRepository(prisma);

  beforeEach(() => create.mockReset());

  it('returns the publicId from the newly created session', async () => {
    const interview = Interview.create({
      userId: 1,
      cvId: 2,
      title: 'Backend interview',
      jobDescription: null,
    });
    if (interview.isErr()) throw interview.error;
    expect(interview.value.status).toBe(CommonSessionStatus.CREATED);

    create.mockResolvedValue({ publicId: 'session-public-id' });

    const result = await repository.createInterviewSession(interview.value);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toBe('session-public-id');
    expect(create).toHaveBeenCalledWith({
      data: {
        title: 'Backend interview',
        jobDescription: null,
        status: 'CREATED',
        userId: 1,
        cvId: 2,
      },
      select: { publicId: true },
    });
  });

  it('returns a safe error when Prisma rejects the write', async () => {
    const interview = Interview.create({
      userId: 1,
      cvId: 2,
      title: 'Backend interview',
      jobDescription: null,
    });
    if (interview.isErr()) throw interview.error;

    create.mockRejectedValue(new Error('database secret'));

    const result = await repository.createInterviewSession(interview.value);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected repository error');
    expect(result.error.message).toBe('Failed to create interview session.');
  });
});
