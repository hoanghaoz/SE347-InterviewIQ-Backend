import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CreateCheatLogRequestDto } from './cheat-log.request.dto';

// Payload of the `cheat-log:record` WebSocket event: the REST body plus the
// session id that the REST route carries in its path.
export class RecordCheatLogMessageDto extends CreateCheatLogRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionPublicId!: string;
}
