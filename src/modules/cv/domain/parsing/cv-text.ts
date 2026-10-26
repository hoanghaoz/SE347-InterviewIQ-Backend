export const MIN_CV_TEXT_LENGTH = 50;
export const MAX_CV_TEXT_LENGTH = 30_000;
export const MAX_CV_PAGES = 20;

export function normalizeCvText(raw: string): string {
  return raw
    .replaceAll('\u0000', '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CV_TEXT_LENGTH);
}
