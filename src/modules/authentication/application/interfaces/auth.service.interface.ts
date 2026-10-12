import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { RegisterDto, VerifyRegistrationDto } from '../dtos/auth.request.dto';

export abstract class IAuthService {
  abstract registerAsync(request: RegisterDto): Promise<Result<void, AppError>>;
  abstract verifyRegistrationAsync(
    request: VerifyRegistrationDto,
  ): Promise<Result<{ email: string }, AppError>>;
}
