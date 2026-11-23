export const SCORING_WEIGHTS = {
  content: 0.4,
  relevance: 0.4,
  confidence: 0.2,
} as const;

export const SCORING_LIMITS = {
  minScore: 0,
  maxScore: 10,
  maxOverallFeedbackChars: 10_000,
  maxItemTitleChars: 200,
  maxItemDescriptionChars: 1_000,
  maxItemSuggestionChars: 1_000,
  maxFeedbackItems: 5,
  maxScoringModelChars: 100,
  maxPromptVersionChars: 50,
  maxCvSectionChars: 6_000,
  maxJobDescriptionChars: 3_000,
  maxTranscriptCharsPerAnswer: 4_000,
  maxTotalTranscriptChars: 24_000,
  maxCvExperiencesInPrompt: 5,
  maxCvProjectsInPrompt: 5,
} as const;

export function calculateOverallScore(
  contentScore: number,
  relevanceScore: number,
  confidenceScore: number,
): number {
  return Number(
    (
      contentScore * SCORING_WEIGHTS.content +
      relevanceScore * SCORING_WEIGHTS.relevance +
      confidenceScore * SCORING_WEIGHTS.confidence
    ).toFixed(1),
  );
}
