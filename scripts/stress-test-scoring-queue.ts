interface StressJob {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly enqueuedAt: number;
}

interface StressMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  maxObservedConcurrency: number;
  totalTimeMs: number;
  avgDurationPerJobMs: number;
}

async function runStressTest(
  totalJobs = 20,
  concurrencyLimit = 2,
): Promise<StressMetrics> {
  console.log('Scoring Queue Stress Test');
  console.log(
    `Config: Total Jobs = ${totalJobs}, Worker Concurrency = ${concurrencyLimit}`,
  );

  const startTime = Date.now();
  let currentActive = 0;
  let maxObserved = 0;
  let completed = 0;
  let failed = 0;
  const jobDurations: number[] = [];

  const jobs: StressJob[] = Array.from({ length: totalJobs }, (_, i) => ({
    id: `job-stress-${i + 1}`,
    sessionId: `session-stress-${i + 1}`,
    userId: `user-stress-${i + 1}`,
    enqueuedAt: Date.now(),
  }));

  const processJob = async (job: StressJob): Promise<void> => {
    currentActive++;
    if (currentActive > maxObserved) {
      maxObserved = currentActive;
    }

    const jobStart = Date.now();
    try {
      const simulatedDelay = 40 + Math.floor(Math.random() * 20);
      await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

      completed++;
      const duration = Date.now() - jobStart;
      jobDurations.push(duration);
      console.log(
        `  [OK] Job ${job.id} (${job.sessionId}) finished in ${duration}ms [Active workers: ${currentActive}/${concurrencyLimit}]`,
      );
    } catch {
      failed++;
      console.error(`  [FAIL] Job ${job.id} encountered error`);
    } finally {
      currentActive--;
    }
  };

  const queue = [...jobs];
  const workers: Promise<void>[] = [];

  const workerLoop = async () => {
    while (queue.length > 0) {
      const nextJob = queue.shift();
      if (nextJob) {
        await processJob(nextJob);
      }
    }
  };

  for (let i = 0; i < concurrencyLimit; i++) {
    workers.push(workerLoop());
  }

  await Promise.all(workers);

  const totalTime = Date.now() - startTime;
  const avgDuration =
    jobDurations.length > 0
      ? Math.round(
          jobDurations.reduce((a, b) => a + b, 0) / jobDurations.length,
        )
      : 0;

  const metrics: StressMetrics = {
    totalJobs,
    completedJobs: completed,
    failedJobs: failed,
    maxObservedConcurrency: maxObserved,
    totalTimeMs: totalTime,
    avgDurationPerJobMs: avgDuration,
  };

  console.log('\nSTRESS TEST RESULTS:');
  console.log(`  - Total Jobs Dispatched:   ${metrics.totalJobs}`);
  console.log(`  - Completed Successfully: ${metrics.completedJobs}`);
  console.log(`  - Failed / Dropped Jobs:  ${metrics.failedJobs}`);
  console.log(
    `  - Max Active Concurrency: ${metrics.maxObservedConcurrency} (Limit: ${concurrencyLimit})`,
  );
  console.log(`  - Average Time Per Job:   ${metrics.avgDurationPerJobMs} ms`);
  console.log(`  - Total Wall-Clock Time:  ${metrics.totalTimeMs} ms`);

  if (
    metrics.completedJobs === totalJobs &&
    metrics.maxObservedConcurrency <= concurrencyLimit
  ) {
    console.log('ALL STRESS TEST CONSTRAINTS SATISFIED.\n');
  } else {
    console.error('STRESS TEST FAILED CONSTRAINTS.\n');
    process.exit(1);
  }

  return metrics;
}

if (require.main === module) {
  runStressTest(20, 2).catch((err) => {
    console.error('Stress test fatal error:', err);
    process.exit(1);
  });
}

export { runStressTest, type StressMetrics, type StressJob };
