import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum PlaygroundMode {
  TEXT = 'text',
  JSON = 'json',
}

export enum PlaygroundProvider {
  DEFAULT = 'default',
  GEMINI = 'gemini',
  GROQ = 'groq',
}

export class RunPlaygroundRequestDto {
  @IsEnum(PlaygroundMode)
  mode!: PlaygroundMode;

  @IsEnum(PlaygroundProvider)
  provider!: PlaygroundProvider;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  /** JSON Schema as a JSON string. Required when `mode` is `json`. */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  schema?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}
