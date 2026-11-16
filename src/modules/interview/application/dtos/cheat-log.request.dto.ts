import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MAX_CHEAT_LOG_DESCRIPTION_LENGTH } from '../../domain/constants/cheat-log.constants';
import { CommonCheatEventType } from '../../domain/enums/interview-enum';

export class CreateCheatLogRequestDto {
  @ApiProperty({
    enum: CommonCheatEventType,
    enumName: 'CommonCheatEventType',
    example: CommonCheatEventType.TAB_SWITCH,
  })
  @IsEnum(CommonCheatEventType)
  eventType!: CommonCheatEventType;

  @ApiProperty({
    format: 'date-time',
    description: 'When the client detected the event (client clock)',
    example: '2026-11-09T10:05:00.000Z',
  })
  @IsISO8601({ strict: true })
  occurredAt!: string;

  @ApiPropertyOptional({
    maxLength: MAX_CHEAT_LOG_DESCRIPTION_LENGTH,
    example: 'Switched to another browser tab',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHEAT_LOG_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Client-generated id of this event. Resending the same id within a session returns the original log instead of recording a second one, so retries after a lost response are safe.',
    example: '8d3f6c1e-5b7a-4e2f-9a0c-1b2d3e4f5a6b',
  })
  @IsOptional()
  @IsUUID()
  clientEventId?: string;
}
