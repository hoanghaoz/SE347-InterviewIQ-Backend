import type { UUID } from 'crypto';
import type { Result } from 'neverthrow';
import type { CommonUserRole } from '../../../../shared/common/commonEnum';

export interface AccessTokenPayload {
  readonly sub: UUID;
  readonly role: CommonUserRole;
}

export abstract class IAccessTokenIssuer {
  abstract issueAccessToken(
    payload: AccessTokenPayload,
  ): Promise<Result<string, Error>>;
}
