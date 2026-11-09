import { ApiProperty } from '@nestjs/swagger';
import { CommonCheatEventType } from '../../domain/enums/interview-enum';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class CheatLogDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  id!: string;

  @ApiProperty({
    enum: CommonCheatEventType,
    enumName: 'CommonCheatEventType',
    example: CommonCheatEventType.TAB_SWITCH,
  })
  eventType!: CommonCheatEventType;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-11-09T10:05:00.000Z' })
  occurredAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-09T10:05:01.000Z' })
  createdAt!: string;
}

export class CheatSummaryDto {
  @ApiProperty({ example: 3 })
  totalCount!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Always contains every event type, 0 when none happened',
    example: {
      TAB_SWITCH: 2,
      WINDOW_BLUR: 1,
      FACE_MISSING: 0,
      MULTIPLE_FACES: 0,
    },
  })
  countsByType!: Record<CommonCheatEventType, number>;
}

export class CheatLogCreatedResponseDto {
  @ApiProperty({ type: CheatLogDto })
  log!: CheatLogDto;

  @ApiProperty({ type: CheatSummaryDto })
  summary!: CheatSummaryDto;
}

export class CheatLogListResponseDto {
  @ApiProperty({ type: [CheatLogDto] })
  logs!: CheatLogDto[];

  @ApiProperty({ type: CheatSummaryDto })
  summary!: CheatSummaryDto;
}
