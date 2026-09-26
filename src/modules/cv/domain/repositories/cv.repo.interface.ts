import { Result } from 'neverthrow';

export type AuthorizeUserCvResult = {
  cvId: number;
  userId: number;
  // add parsed data after owner created a type
};
export abstract class ICvRepository {
  abstract authorizeUserCv(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<AuthorizeUserCvResult | null, Error>>;
}
