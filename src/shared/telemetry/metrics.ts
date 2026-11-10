import {
  Attributes,
  Counter,
  Histogram,
  metrics,
  ObservableResult,
} from '@opentelemetry/api';
import { TELEMETRY_NAME } from './telemetry';

/**
 * Central registry of custom metrics. Names live here so dashboards and alerts
 * have one source of truth. Keep label values low-cardinality: never put ids,
 * emails or tokens in a metric attribute (use span attributes for those).
 *
 * Prometheus names: dots become underscores, counters gain `_total`,
 * histograms with unit `s` become `_seconds_{bucket,sum,count}`.
 */

const SHORT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const LLM_BUCKETS = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120];
const JOB_BUCKETS = [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];

function createInstruments() {
  const meter = metrics.getMeter(TELEMETRY_NAME);
  const counter = (name: string, description: string): Counter =>
    meter.createCounter(name, { description });
  const histogram = (
    name: string,
    description: string,
    boundaries: number[],
  ): Histogram =>
    meter.createHistogram(name, {
      description,
      unit: 's',
      advice: { explicitBucketBoundaries: boundaries },
    });

  return {
    meter,

    // LLM
    llmRequestDuration: histogram(
      'llm.request.duration',
      'End-to-end LLM call latency per vendor attempt',
      LLM_BUCKETS,
    ),
    llmTokens: counter('llm.tokens', 'LLM tokens used, by direction'),
    llmFallbackTriggered: counter(
      'llm.fallback.triggered',
      'Primary LLM provider failed and the secondary was tried',
    ),
    llmFallbackBothFailed: counter(
      'llm.fallback.both_failed',
      'Both LLM providers failed',
    ),
    llmJsonRetry: counter(
      'llm.json.retry',
      'LLM returned invalid JSON (final=true when no retry is left)',
    ),

    // Scoring
    scoringJobsEnqueued: counter(
      'scoring.jobs.enqueued',
      'Scoring jobs accepted by the queue',
    ),
    scoringJobsDeduped: counter(
      'scoring.jobs.deduped',
      'Scoring enqueue rejected because a job for the session is already queued',
    ),
    scoringJobsCompleted: counter(
      'scoring.jobs.completed',
      'Scoring jobs finished successfully',
    ),
    scoringJobsFailed: counter(
      'scoring.jobs.failed',
      'Scoring job attempts that failed (final=true when no retry is left)',
    ),
    scoringJobsSessionMissing: counter(
      'scoring.jobs.session_missing',
      'Scoring jobs whose session no longer exists (job is dropped as done)',
    ),
    scoringJobDuration: histogram(
      'scoring.job.duration',
      'Time spent processing one scoring job attempt',
      JOB_BUCKETS,
    ),
    scoringQueueWaitTime: histogram(
      'scoring.queue.wait_time',
      'Time between enqueue and the worker picking the job up',
      JOB_BUCKETS,
    ),
    scoringSessionsMarkedFailed: counter(
      'scoring.sessions.marked_failed',
      'Interview sessions moved to a failed scoring state',
    ),

    // CV
    cvParseDuration: histogram(
      'cv.parse.duration',
      'CV parse pipeline step duration',
      LLM_BUCKETS,
    ),
    cvParseOutcome: counter(
      'cv.parse.outcome',
      'CV parse results (failed ones carry the failing step)',
    ),

    // Auth
    authOtpSent: counter('auth.otp.sent', 'OTP emails requested'),
    authOtpVerify: counter('auth.otp.verify', 'OTP verification attempts'),
    authLogin: counter('auth.login', 'Login attempts by outcome'),
    authRefreshReuse: counter(
      'auth.refresh.reuse_detected',
      'A revoked refresh token was presented again (token theft signal)',
    ),
    authBcryptDuration: histogram(
      'auth.bcrypt.duration',
      'bcrypt hash/compare duration (CPU bound)',
      SHORT_BUCKETS,
    ),
    emailSendDuration: histogram(
      'email.send.duration',
      'SMTP send latency',
      SHORT_BUCKETS,
    ),
    emailSendFailures: counter('email.send.failures', 'SMTP send failures'),

    // Interview
    interviewSessionCreated: counter(
      'interview.session.created',
      'Interview sessions created',
    ),
    interviewSessionStarted: counter(
      'interview.session.started',
      'Interview sessions started',
    ),
    interviewSessionSubmitted: counter(
      'interview.session.submitted',
      'Interview sessions submitted',
    ),
    interviewSubmitEnqueueFailed: counter(
      'interview.submit.enqueue_failed',
      'Session was marked submitted but the scoring enqueue failed',
    ),
    interviewAnswerSaved: counter(
      'interview.answer.saved',
      'Answer save attempts by outcome',
    ),
    questionGenerationDuration: histogram(
      'question_generation.duration',
      'Interview question generation latency',
      LLM_BUCKETS,
    ),
    questionGenerationTimeout: counter(
      'question_generation.timeout',
      'Question generation timed out',
    ),
    questionGenerationValidationRetry: counter(
      'question_generation.validation_retry',
      'Generated question set failed validation and was regenerated',
    ),

    // External
    cloudinaryRequestDuration: histogram(
      'cloudinary.request.duration',
      'Cloudinary API call latency',
      SHORT_BUCKETS,
    ),

    // Cheat log
    cheatLogRecorded: counter(
      'cheat_log.recorded',
      'Cheat events recorded, by event type',
    ),
    cheatLogRejected: counter(
      'cheat_log.rejected',
      'Cheat events rejected, by reason',
    ),
  };
}

type Instruments = ReturnType<typeof createInstruments>;

let cached: Instruments | undefined;

/**
 * Instruments are created on first use so they bind to whichever MeterProvider
 * is registered by then (the `--require` hook installs it before app code).
 * Without an SDK they are no-ops.
 */
export function instruments(): Instruments {
  cached ??= createInstruments();
  return cached;
}

/** Test hook: forget cached instruments so a new MeterProvider is picked up. */
export function resetInstrumentsForTesting(): void {
  cached = undefined;
}

/** Starts a wall-clock timer; the returned function yields elapsed seconds. */
export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1e9;
}

/**
 * Registers a gauge sampled at scrape time. The callback may be async; errors
 * are swallowed so telemetry can never break the app.
 */
export function registerObservableGauge(
  name: string,
  description: string,
  sample: () => Promise<Array<{ value: number; attributes: Attributes }>>,
): void {
  const gauge = instruments().meter.createObservableGauge(name, {
    description,
  });
  gauge.addCallback(async (result: ObservableResult) => {
    try {
      for (const { value, attributes } of await sample()) {
        result.observe(value, attributes);
      }
    } catch {
      // Sampling failed (e.g. database down); skip this interval.
    }
  });
}
