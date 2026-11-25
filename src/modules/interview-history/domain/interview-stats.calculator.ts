import type { InterviewStatsScores } from './repositories/interview-stats.repo.interface';

// Làm tròn 1 chữ số thập phân, giống calculateOverallScore của Scoring module,
// để trung bình và chênh lệch không lộ số kiểu 0.6999999999999993.
export function roundScore(value: number): number {
  const rounded = Number(value.toFixed(1));
  // -0.04 làm tròn ra -0; đổi về 0 để client không phải xử lý số 0 âm.
  return rounded === 0 ? 0 : rounded;
}

export function roundScores(
  scores: InterviewStatsScores,
): InterviewStatsScores {
  return {
    contentScore: roundScore(scores.contentScore),
    relevanceScore: roundScore(scores.relevanceScore),
    confidenceScore: roundScore(scores.confidenceScore),
    overallScore: roundScore(scores.overallScore),
  };
}

// current - previous cho từng tiêu chí: dương là tiến bộ, âm là đi xuống.
export function subtractScores(
  current: InterviewStatsScores,
  previous: InterviewStatsScores,
): InterviewStatsScores {
  return roundScores({
    contentScore: current.contentScore - previous.contentScore,
    relevanceScore: current.relevanceScore - previous.relevanceScore,
    confidenceScore: current.confidenceScore - previous.confidenceScore,
    overallScore: current.overallScore - previous.overallScore,
  });
}
