import { Result } from 'neverthrow';
import { CvParsedData } from '../types/cv-parsed-data.type';

// Copy of the CV stored in interview_sessions.cv_snapshot, so an interview keeps
// the CV it was generated from even if the CV is later edited, re-parsed or deleted.
// Keys match the cv_snapshot migration (20260925120000).
export type CvSnapshot = {
  sourceCvPublicId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  rawText: string | null;
  parsedData: CvParsedData | null;
  parserVersion: string | null;
};

export type AuthorizeUserCvResult = {
  cvId: number;
  userId: number;
  snapshot: CvSnapshot;
};

// Narrow contract exported to other modules (used by interview.service, Luồng 3).
// Keep it small: adding methods here breaks their mocks. CV-internal methods
// live in ICvManagementRepository.
export abstract class ICvRepository {
  abstract authorizeUserCv(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<AuthorizeUserCvResult | null, Error>>;
}
