import { Result } from 'neverthrow';
import { Cv } from '../entities/cv.entity';

// Returned by createCv when a CV for the same Cloudinary file already exists.
export class CvFileAlreadySavedError extends Error {
  constructor() {
    super('A CV for this file already exists.');
  }
}

export type StartParseOutcome =
  | { status: 'started'; cv: Cv }
  | { status: 'not_found' }
  | { status: 'not_parsable' };

// Repository used only inside the cv module (not exported).
export abstract class ICvManagementRepository {
  // Internal user id for a JWT `sub`; null when the user no longer exists.
  abstract getUserIdByPublicId(
    userPublicId: string,
  ): Promise<Result<number | null, Error>>;

  // Returns the saved CV, now with id / publicId / timestamps from the DB.
  // Fails with CvFileAlreadySavedError on a duplicate cloudinaryPublicId.
  abstract createCv(cv: Cv): Promise<Result<Cv, Error>>;

  abstract getCvsByUser(userPublicId: string): Promise<Result<Cv[], Error>>;

  // Scoped to the owner: another user's CV is reported as null (not found).
  abstract getCvByPublicId(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<Cv | null, Error>>;

  // Atomically moves the CV to PROCESSING, so two requests can never parse it at once.
  // Allowed from PENDING, FAILED, or PROCESSING older than staleBefore (a crashed parse).
  abstract tryStartParse(
    userPublicId: string,
    cvPublicId: string,
    staleBefore: Date,
  ): Promise<Result<StartParseOutcome, Error>>;

  // Stores status, rawText, parsedData and parserVersion of a finished parse.
  abstract saveParseResult(cv: Cv): Promise<Result<Cv, Error>>;

  // Stores only parsedData (manual edit).
  abstract saveParsedData(cv: Cv): Promise<Result<Cv, Error>>;
}
