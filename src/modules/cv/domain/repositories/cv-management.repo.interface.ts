import { Result } from 'neverthrow';
import { Cv } from '../entities/cv.entity';

// Returned by createCv when a CV for the same Cloudinary file already exists.
export class CvFileAlreadySavedError extends Error {
  constructor() {
    super('A CV for this file already exists.');
  }
}

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
}
