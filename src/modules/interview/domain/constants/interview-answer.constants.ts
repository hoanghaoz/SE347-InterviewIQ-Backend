export const INTERVIEW_VIDEO_FORMATS = ['mp4', 'webm'] as const;
export const MAX_INTERVIEW_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_ANSWER_TRANSCRIPT_LENGTH = 50_000;
export const MAX_EMOTION_TIMELINE_POINTS = 300;
export const MAX_EMOTION_STATE_LENGTH = 32;
/** Một câu trả lời không dài quá 24 giờ; chặn giá trị `t` vô lý. */
export const MAX_EMOTION_TIMELINE_SECONDS = 86_400;
export const MAX_EMOTION_SAMPLE_COUNT = 100_000;
