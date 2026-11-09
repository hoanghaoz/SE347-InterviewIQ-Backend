import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { CreateCheatLogRequestDto } from '../dtos/cheat-log.request.dto';
import type {
  CheatLogCreatedResponseDto,
  CheatLogListResponseDto,
} from '../dtos/cheat-log.response.dto';

export abstract class ICheatLogService {
  abstract recordCheatEventAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: CreateCheatLogRequestDto,
  ): Promise<Result<CheatLogCreatedResponseDto, AppError>>;

  abstract getCheatLogsAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<CheatLogListResponseDto, AppError>>;
}
