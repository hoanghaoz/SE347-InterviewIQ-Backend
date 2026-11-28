import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { SCORING_LIMITS } from '../../../scoring/domain/constants/scoring.constants';
import type {
  InterviewStatsData,
  InterviewStatsSessionData,
} from '../../domain/repositories/interview-stats.repo.interface';
import { InterviewStatsQueryDto } from '../dtos/interview-stats.request.dto';
import { InterviewStatsService } from './interview-stats.service';

describe('InterviewStatsService', () => {
  const interviewStatsRepo = { getInterviewStats: jest.fn() };
  const service = new InterviewStatsService(interviewStatsRepo);

  const userPublicId = '00000000-0000-4000-8000-000000000001';

  const query = (
    overrides: Partial<InterviewStatsQueryDto> = {},
  ): InterviewStatsQueryDto => ({ limit: 20, ...overrides });

  const session = (
    index: number,
    overallScore: number,
    overrides: Partial<InterviewStatsSessionData> = {},
  ): InterviewStatsSessionData => ({
    sessionPublicId: `00000000-0000-4000-8000-00000000000${index}`,
    title: `Session ${index}`,
    createdAt: new Date(`2026-10-0${index}T08:00:00.000Z`),
    contentScore: overallScore,
    relevanceScore: overallScore,
    confidenceScore: overallScore,
    overallScore,
    ...overrides,
  });

  const sessionDto = (data: InterviewStatsSessionData) => ({
    id: data.sessionPublicId,
    title: data.title,
    createdAt: data.createdAt.toISOString(),
    contentScore: data.contentScore,
    relevanceScore: data.relevanceScore,
    confidenceScore: data.confidenceScore,
    overallScore: data.overallScore,
  });

  const emptyData: InterviewStatsData = {
    completedSessions: 0,
    answeredQuestions: 0,
    averages: null,
    best: null,
    recent: [],
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns zero counts and nulls when there is no completed session', async () => {
    interviewStatsRepo.getInterviewStats.mockResolvedValue(ok(emptyData));

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({
      maxScore: SCORING_LIMITS.maxScore,
      completedSessions: 0,
      answeredQuestions: 0,
      averages: null,
      best: null,
      trend: [],
      comparison: null,
    });
  });

  it('rounds the database averages to one decimal', async () => {
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      ok({
        ...emptyData,
        completedSessions: 3,
        averages: {
          contentScore: 20 / 3,
          relevanceScore: 16 / 3,
          confidenceScore: 13 / 3,
          // 8, 6 và 0: buổi bỏ trống bị chấm 0 vẫn nằm trong trung bình
          overallScore: 14 / 3,
        },
      }),
    );

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isErr()) throw result.error;
    expect(result.value.averages).toEqual({
      contentScore: 6.7,
      relevanceScore: 5.3,
      confidenceScore: 4.3,
      overallScore: 4.7,
    });
  });

  it('returns the trend oldest first for the line chart', async () => {
    const recent = [session(3, 7.6), session(2, 6.9), session(1, 5)];
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      ok({ ...emptyData, completedSessions: 3, recent }),
    );

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isErr()) throw result.error;
    expect(result.value.trend).toEqual([
      sessionDto(recent[2]),
      sessionDto(recent[1]),
      sessionDto(recent[0]),
    ]);
  });

  it('compares the latest session with the previous one', async () => {
    const latest = session(3, 7.4, {
      contentScore: 8,
      relevanceScore: 7.6,
      confidenceScore: 6,
    });
    const previous = session(2, 7.4, {
      contentScore: 7.5,
      relevanceScore: 6.9,
      confidenceScore: 6.5,
    });
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      ok({ ...emptyData, completedSessions: 2, recent: [latest, previous] }),
    );

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isErr()) throw result.error;
    expect(result.value.comparison).toEqual({
      latest: sessionDto(latest),
      previous: sessionDto(previous),
      delta: {
        contentScore: 0.5,
        relevanceScore: 0.7,
        confidenceScore: -0.5,
        overallScore: 0,
      },
    });
  });

  it('has no previous session and no delta with a single session', async () => {
    const only = session(1, 6.5);
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      ok({ ...emptyData, completedSessions: 1, recent: [only] }),
    );

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isErr()) throw result.error;
    expect(result.value.trend).toEqual([sessionDto(only)]);
    expect(result.value.comparison).toEqual({
      latest: sessionDto(only),
      previous: null,
      delta: null,
    });
  });

  it('maps the best session as stored', async () => {
    const best = session(2, 8.5);
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      ok({ ...emptyData, completedSessions: 2, best, recent: [best] }),
    );

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isErr()) throw result.error;
    expect(result.value.best).toEqual(sessionDto(best));
  });

  it('asks for the requested number of recent sessions', async () => {
    interviewStatsRepo.getInterviewStats.mockResolvedValue(ok(emptyData));

    await service.getInterviewStatsAsync(userPublicId, query({ limit: 30 }));

    expect(interviewStatsRepo.getInterviewStats).toHaveBeenCalledWith(
      userPublicId,
      { fromDate: undefined, toDate: undefined },
      30,
    );
  });

  // limit=1 vẫn phải so sánh được với buổi liền trước
  it('loads two sessions for the comparison but trims the trend to limit', async () => {
    const recent = [session(2, 7), session(1, 6)];
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      ok({ ...emptyData, completedSessions: 2, recent }),
    );

    const result = await service.getInterviewStatsAsync(
      userPublicId,
      query({ limit: 1 }),
    );

    if (result.isErr()) throw result.error;
    expect(interviewStatsRepo.getInterviewStats).toHaveBeenCalledWith(
      userPublicId,
      expect.anything(),
      2,
    );
    expect(result.value.trend).toEqual([sessionDto(recent[0])]);
    expect(result.value.comparison?.previous).toEqual(sessionDto(recent[1]));
  });

  it('turns the date strings into the createdAt filter', async () => {
    interviewStatsRepo.getInterviewStats.mockResolvedValue(ok(emptyData));

    await service.getInterviewStatsAsync(
      userPublicId,
      query({
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-31T23:59:59.000Z',
      }),
    );

    expect(interviewStatsRepo.getInterviewStats).toHaveBeenCalledWith(
      userPublicId,
      {
        fromDate: new Date('2026-10-01T00:00:00.000Z'),
        toDate: new Date('2026-10-31T23:59:59.000Z'),
      },
      20,
    );
  });

  it('accepts a range where fromDate equals toDate', async () => {
    interviewStatsRepo.getInterviewStats.mockResolvedValue(ok(emptyData));
    const instant = '2026-10-01T00:00:00.000Z';

    const result = await service.getInterviewStatsAsync(
      userPublicId,
      query({ fromDate: instant, toDate: instant }),
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects fromDate after toDate without querying the database', async () => {
    const result = await service.getInterviewStatsAsync(
      userPublicId,
      query({
        fromDate: '2026-11-01T00:00:00.000Z',
        toDate: '2026-10-01T00:00:00.000Z',
      }),
    );

    if (result.isOk()) throw new Error('Expected a validation error');
    expect(result.error.code).toBe(ErrorCode.BadRequest);
    expect(result.error.message).toBe(
      'fromDate must be before or equal to toDate',
    );
    expect(interviewStatsRepo.getInterviewStats).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when the repository fails', async () => {
    interviewStatsRepo.getInterviewStats.mockResolvedValue(
      err(new Error('Failed to get the interview stats')),
    );

    const result = await service.getInterviewStatsAsync(userPublicId, query());

    if (result.isOk()) throw new Error('Expected a service error');
    expect(result.error.code).toBe(ErrorCode.InternalServerError);
    expect(result.error.message).toBe('Failed to load the interview stats');
  });
});
