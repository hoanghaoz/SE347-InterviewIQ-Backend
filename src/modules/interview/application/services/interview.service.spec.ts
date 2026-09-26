import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { ICvRepository } from '../../../cv/domain/repositories/cv.repo.interface';
import { Interview } from '../../domain/entities/interview.entity';
import { IInterviewRepository } from '../../domain/repositories/interview.repo.interface';
import { InterviewService } from './interview.service';

describe('InterviewService', () => {
  const authorizeUserCv = jest.fn<
    ReturnType<ICvRepository['authorizeUserCv']>,
    Parameters<ICvRepository['authorizeUserCv']>
  >();
  const createInterviewSession = jest.fn<
    ReturnType<IInterviewRepository['createInterviewSession']>,
    Parameters<IInterviewRepository['createInterviewSession']>
  >();
  const service = new InterviewService(
    { createInterviewSession },
    { authorizeUserCv },
  );
  const cvPublicId = '00000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    authorizeUserCv.mockReset();
    createInterviewSession.mockReset();
  });

  it('creates an interview with the authorized internal IDs', async () => {
    authorizeUserCv.mockResolvedValue(ok({ userId: 1, cvId: 2 }));
    createInterviewSession.mockResolvedValue(ok('session-public-id'));

    const result = await service.createInterviewSessionAsync('user-public-id', {
      cvPublicId,
      title: 'Backend interview',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toBe('session-public-id');
    expect(createInterviewSession).toHaveBeenCalledWith(expect.any(Interview));
    const interview = createInterviewSession.mock.calls[0][0];
    expect(interview.userId).toBe(1);
    expect(interview.cvId).toBe(2);
    expect(interview.jobDescription).toBeNull();
  });

  it('maps domain validation errors to a specific bad request', async () => {
    authorizeUserCv.mockResolvedValue(ok({ userId: 1, cvId: 2 }));

    const result = await service.createInterviewSessionAsync('user-public-id', {
      cvPublicId,
      title: 'x'.repeat(256),
      jobDescription: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected validation error');
    expect(result.error.code).toBe(ErrorCode.BadRequest);
    expect(result.error.message).toBe(
      'Interview title must not exceed 255 characters.',
    );
    expect(createInterviewSession).not.toHaveBeenCalled();
  });

  it('returns a safe error when CV authorization fails', async () => {
    authorizeUserCv.mockResolvedValue(err(new Error('database secret')));

    const result = await service.createInterviewSessionAsync('user-public-id', {
      cvPublicId,
      title: 'Backend interview',
      jobDescription: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected authorization error');
    expect(result.error.code).toBe(ErrorCode.InternalServerError);
    expect(result.error.message).toBe('Failed to authorize CV');
    expect(createInterviewSession).not.toHaveBeenCalled();
  });
});
