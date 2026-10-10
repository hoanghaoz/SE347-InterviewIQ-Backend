import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { RegisterDto } from '../dtos/auth.request.dto';

export abstract class IAuthService {
  abstract registerAsync(request: RegisterDto): Promise<Result<void, AppError>>;
}
