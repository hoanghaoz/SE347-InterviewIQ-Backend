import { Result } from 'neverthrow';
import { Cv } from '../entities/cv.entity';

// Returned by createCv when a CV for the same Cloudinary file already exists.
export class CvFileAlreadySavedError extends Error {
  constructor() {
    super('A CV for this file already exists.');
  }
}

// Returned by createCv when the user already holds the maximum number of CVs.
export class CvLimitReachedError extends Error {
  constructor() {
    super('The CV limit of this user is reached.');
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
  // Fails with CvFileAlreadySavedError on a duplicate cloudinaryPublicId, and with
  // CvLimitReachedError when the user already has maxCvsPerUser CVs. The count and
  // the insert happen in one transaction, so parallel uploads cannot pass the limit.
  abstract createCv(cv: Cv, maxCvsPerUser: number): Promise<Result<Cv, Error>>;

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

  // Points the CV at a new file and resets the parse (see Cv.replaceFile). Returns null
  // when the row changed in the meantime: it is being parsed, or another replace won.
  // Fails with CvFileAlreadySavedError when the new file belongs to another CV.
  abstract replaceFile(
    cv: Cv,
    previousCloudinaryPublicId: string,
    staleBefore: Date,
  ): Promise<Result<Cv | null, Error>>;

  // Idempotent: deleting a CV that is already gone is not an error.
  abstract deleteCv(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<void, Error>>;
}
