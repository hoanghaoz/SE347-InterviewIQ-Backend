import { err, ok } from 'neverthrow';
import { recordMetrics } from '../../../../shared/telemetry/metric-recorder.testing';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { CommonSessionStatus } from '../../domain/enums/interview-enum';
import {
  InterviewAnswerConflictError,
  InterviewAnswerUnavailableError,
} from '../../domain/errors/interview-answer.error';
import { IInterviewAnswerRepository } from '../../domain/repositories/interview-answer.repo.interface';
import { IInterviewVideoStorage } from '../interfaces/interview-video-storage.interface';
import { InterviewAnswerService } from './interview-answer.service';

describe('InterviewAnswerService', () => {
  let recorded: ReturnType<typeof recordMetrics>;

  beforeEach(() => {
    recorded = recordMetrics();
  });

  afterEach(() => {
    recorded.stop();
  });

  const getQuestionForUser = jest.fn<
    ReturnType<IInterviewAnswerRepository['getQuestionForUser']>,
    Parameters<IInterviewAnswerRepository['getQuestionForUser']>
  >();
  const saveAnswer = jest.fn<
    ReturnType<IInterviewAnswerRepository['saveAnswer']>,
    Parameters<IInterviewAnswerRepository['saveAnswer']>
  >();
  const createSignedUpload = jest.fn<
    ReturnType<IInterviewVideoStorage['createSignedUpload']>,
    Parameters<IInterviewVideoStorage['createSignedUpload']>
  >();
  const getVideo = jest.fn<
    ReturnType<IInterviewVideoStorage['getVideo']>,
    Parameters<IInterviewVideoStorage['getVideo']>
  >();
  const service = new InterviewAnswerService(
    { getQuestionForUser, saveAnswer },
    { createSignedUpload, getVideo },
  );
  const userId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const questionId = '00000000-0000-4000-8000-000000000003';
  const uploadId = '00000000-0000-4000-8000-000000000004';
  const prefix = `interview-answers/${userId}/${sessionId}/${questionId}/`;
  const request = {
    cloudinaryPublicId: `${prefix}${uploadId}`,
    transcript: 'My answer',
  };
  const video = {
    url: 'https://res.cloudinary.com/demo/video/upload/v1/answer.webm',
    bytes: 1024,
    format: 'webm',
    durationSeconds: 12.25,
    width: 640,
    height: 480,
  };
  const saved = {
    publicId: 'answer-id',
    videoUrl: video.url,
    transcript: request.transcript,
    durationSeconds: 13,
    createdAt: new Date('2026-10-12T10:00:00.000Z'),
    updatedAt: new Date('2026-10-12T10:00:00.000Z'),
  };
  const sign = () =>
    service.createSignedParamsAsync(userId, sessionId, questionId);
  const save = () =>
    service.saveAnswerAsync(userId, sessionId, questionId, request);

  beforeEach(() => {
    jest.resetAllMocks();
    getQuestionForUser.mockResolvedValue(
      ok({ status: CommonSessionStatus.IN_PROGRESS }),
    );
    createSignedUpload.mockImplementation((cloudinaryPublicId) =>
      ok({
        cloudinaryPublicId,
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
        apiKey: 'key',
        timestamp: 123,
        signature: 'signature',
        resourceType: 'video',
        allowedFormats: 'mp4,webm',
        overwrite: false,
        maxFileSizeBytes: 104857600,
      }),
    );
    getVideo.mockResolvedValue(ok(video));
    saveAnswer.mockResolvedValue(ok(saved));
  });

  it('signs a fresh asset scoped to the authorized user, session and question', async () => {
    const first = await sign();
    const second = await sign();
    if (first.isErr()) throw first.error;
    if (second.isErr()) throw second.error;
    expect(first.value.cloudinaryPublicId).toMatch(
      new RegExp(`^${prefix}[0-9a-f-]{36}$`),
    );
    expect(first.value.cloudinaryPublicId).not.toBe(
      second.value.cloudinaryPublicId,
    );
    expect(getQuestionForUser).toHaveBeenCalledWith(
      userId,
      sessionId,
      questionId,
    );
    expect(createSignedUpload).toHaveBeenCalledWith(
      first.value.cloudinaryPublicId,
    );
    expect(first.value).not.toHaveProperty('apiSecret');
  });

  it.each(['sign', 'save'])(
    'hides a missing, wrong-user or mismatched question for %s',
    async (operation) => {
      getQuestionForUser.mockResolvedValue(ok(null));
      const result = await (operation === 'sign' ? sign() : save());
      if (result.isOk()) throw new Error('Expected not found');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(createSignedUpload).not.toHaveBeenCalled();
      expect(getVideo).not.toHaveBeenCalled();
      expect(saveAnswer).not.toHaveBeenCalled();
    },
  );

  it.each(['sign', 'save'])(
    'sanitizes authorization failures for %s',
    async (operation) => {
      getQuestionForUser.mockResolvedValue(err(new Error('database secret')));
      const result = await (operation === 'sign' ? sign() : save());
      if (result.isOk()) throw new Error('Expected authorization failure');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
      expect(getVideo).not.toHaveBeenCalled();
    },
  );

  it.each([
    CommonSessionStatus.CREATED,
    CommonSessionStatus.SUBMITTED,
    CommonSessionStatus.SCORING,
    CommonSessionStatus.COMPLETED,
    CommonSessionStatus.FAILED,
    CommonSessionStatus.CANCELLED,
  ])('rejects uploads and answer changes in %s', async (status) => {
    getQuestionForUser.mockResolvedValue(ok({ status }));
    for (const result of [await sign(), await save()]) {
      if (result.isOk()) throw new Error('Expected conflict');
      expect(result.error.code).toBe(ErrorCode.Conflict);
    }
    expect(createSignedUpload).not.toHaveBeenCalled();
    expect(getVideo).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it('sanitizes signing failures', async () => {
    createSignedUpload.mockReturnValue(err(new Error('Cloudinary secret')));
    const result = await sign();
    if (result.isOk()) throw new Error('Expected signing failure');
    expect(result.error.code).toBe(ErrorCode.InternalServerError);
    expect(result.error.message).not.toContain('Cloudinary secret');
  });

  it.each([
    `interview-answers/other-user/${sessionId}/${questionId}/${uploadId}`,
    `interview-answers/${userId}/other-session/${questionId}/${uploadId}`,
    `interview-answers/${userId}/${sessionId}/other-question/${uploadId}`,
    `${prefix}invalid`,
    `${prefix}${uploadId}/extra`,
    `${prefix}../${uploadId}`,
  ])(
    'rejects an asset outside the exact scoped UUID path: %s',
    async (cloudinaryPublicId) => {
      const result = await service.saveAnswerAsync(
        userId,
        sessionId,
        questionId,
        { ...request, cloudinaryPublicId },
      );
      if (result.isOk()) throw new Error('Expected invalid asset');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(getVideo).not.toHaveBeenCalled();
      expect(saveAnswer).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'error'])(
    'does not save when video verification returns %s',
    async (failure) => {
      getVideo.mockResolvedValue(
        failure === 'missing' ? ok(null) : err(new Error('Cloudinary secret')),
      );
      const result = await save();
      if (result.isOk()) throw new Error('Expected storage failure');
      expect(result.error.code).toBe(
        failure === 'missing'
          ? ErrorCode.BadRequest
          : ErrorCode.InternalServerError,
      );
      expect(result.error.message).not.toContain('Cloudinary secret');
      expect(saveAnswer).not.toHaveBeenCalled();
    },
  );

  it.each([
    { format: 'mp3' },
    { bytes: 104857601 },
    { bytes: 0 },
    { bytes: NaN },
    { durationSeconds: 0 },
    { durationSeconds: Infinity },
    { durationSeconds: 2147483648 },
    { width: 0 },
    { height: 0 },
    { url: 'http://example.com/video.mp4' },
    { url: `https://example.com/${'a'.repeat(500)}` },
  ])('rejects invalid or audio-only video metadata: %j', async (override) => {
    getVideo.mockResolvedValue(ok({ ...video, ...override }));
    const result = await save();
    if (result.isOk()) throw new Error('Expected invalid video');
    expect(result.error.code).toBe(ErrorCode.BadRequest);
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it.each(['mp4', 'webm'])(
    'accepts %s at the 100 MiB size boundary',
    async (format) => {
      getVideo.mockResolvedValue(ok({ ...video, format, bytes: 104857600 }));
      const result = await save();
      if (result.isErr()) throw result.error;
      expect(result.value.videoUrl).toBe(video.url);
      expect(saveAnswer).toHaveBeenCalledTimes(1);
    },
  );

  it.each([CommonSessionStatus.IN_PROGRESS])(
    'saves trusted video metadata and transcript in %s',
    async (status) => {
      getQuestionForUser.mockResolvedValue(ok({ status }));
      const result = await save();
      if (result.isErr()) throw result.error;
      expect(getVideo).toHaveBeenCalledWith(request.cloudinaryPublicId);
      expect(saveAnswer).toHaveBeenCalledWith({
        userPublicId: userId,
        sessionPublicId: sessionId,
        questionPublicId: questionId,
        transcript: 'My answer',
        videoUrl: video.url,
        durationSeconds: 13,
        emotionSummary: null,
      });
      expect(result.value).toEqual({
        publicId: 'answer-id',
        questionPublicId: questionId,
        transcript: 'My answer',
        videoUrl: video.url,
        durationSeconds: 13,
        createdAt: '2026-10-12T10:00:00.000Z',
        updatedAt: '2026-10-12T10:00:00.000Z',
      });
      expect(result.value).not.toHaveProperty('questionId');
    },
  );

  it('labels each answer save by outcome', async () => {
    await save();
    getVideo.mockResolvedValueOnce(ok(null));
    await save();
    getVideo.mockResolvedValueOnce(err(new Error('cloudinary')));
    await save();
    saveAnswer.mockResolvedValueOnce(err(new InterviewAnswerConflictError()));
    await save();
    getQuestionForUser.mockResolvedValueOnce(ok(null));
    await save();

    expect(
      recorded.named('interview.answer.saved').map((m) => m.attributes.outcome),
    ).toEqual(['saved', 'rejected', 'error', 'conflict', 'not_found']);
  });

  describe('emotion summary', () => {
    const emotionSummary = {
      sampleIntervalMs: 2000,
      sampleCount: 30,
      validSampleCount: 28,
      distribution: { positive: 0.4, neutral: 0.5, surprised: 0.1 },
      gazeAwayRatio: 0.2,
      dominant: 'neutral',
      timeline: [
        { t: 0, state: 'neutral', gazeAway: false },
        { t: 2, state: 'positive', gazeAway: true },
      ],
    };
    const saveWith = (summary: unknown) =>
      service.saveAnswerAsync(userId, sessionId, questionId, {
        ...request,
        emotionSummary: summary as typeof emotionSummary | null | undefined,
      });

    it('stores the client emotion summary with the answer', async () => {
      const result = await saveWith(emotionSummary);
      if (result.isErr()) throw result.error;
      expect(saveAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ emotionSummary }),
      );
    });

    it.each([null, undefined])(
      'stores null when the summary is %s (camera or model unavailable)',
      async (missing) => {
        const result = await saveWith(missing);
        if (result.isErr()) throw result.error;
        expect(saveAnswer).toHaveBeenCalledWith(
          expect.objectContaining({ emotionSummary: null }),
        );
      },
    );

    it('keeps only the distribution labels that carry a value', async () => {
      const result = await saveWith({
        ...emotionSummary,
        distribution: { positive: 0.5, neutral: undefined, surprised: 0.5 },
      });
      if (result.isErr()) throw result.error;
      expect(saveAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          emotionSummary: expect.objectContaining({
            distribution: { positive: 0.5, surprised: 0.5 },
          }) as unknown,
        }),
      );
    });

    it.each([
      ['more valid samples than samples', { validSampleCount: 31 }],
      ['an empty distribution', { distribution: {} }],
    ])('rejects %s before verifying the video', async (_name, override) => {
      const result = await saveWith({ ...emotionSummary, ...override });
      if (result.isOk()) throw new Error('Expected invalid emotion summary');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(getVideo).not.toHaveBeenCalled();
      expect(saveAnswer).not.toHaveBeenCalled();
    });
  });

  it.each([
    [new InterviewAnswerConflictError(), ErrorCode.Conflict],
    [new InterviewAnswerUnavailableError(), ErrorCode.NotFound],
    [new Error('database secret'), ErrorCode.InternalServerError],
  ])(
    'maps repository failures to safe application errors',
    async (failure, code) => {
      saveAnswer.mockResolvedValue(err(failure));
      const result = await save();
      if (result.isOk()) throw new Error('Expected save failure');
      expect(result.error).toBeInstanceOf(AppError);
      expect(result.error.code).toBe(code);
      expect(result.error.message).not.toContain('database secret');
    },
  );
});
