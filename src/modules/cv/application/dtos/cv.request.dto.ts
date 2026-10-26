import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PARSED_DATA_LIMITS,
  YEAR_MONTH_PATTERN,
} from '../../domain/parsing/parsed-data.normalizer';

const LIMITS = PARSED_DATA_LIMITS;

export class CreateCvRequestDto {
  @IsString({ message: 'File name must be a string' })
  @IsNotEmpty({ message: 'File name is required' })
  @MaxLength(255, { message: 'File name must not exceed 255 characters' })
  fileName!: string;

  // Returned by POST /api/cvs/signed-params and echoed back after the upload.
  @IsString({ message: 'Cloudinary public id must be a string' })
  @IsNotEmpty({ message: 'Cloudinary public id is required' })
  @MaxLength(255, {
    message: 'Cloudinary public id must not exceed 255 characters',
  })
  cloudinaryPublicId!: string;
}

class ParsedSkillsDto {
  @IsArray()
  @ArrayMaxSize(LIMITS.skillCount)
  @IsString({ each: true })
  @MaxLength(LIMITS.skillLength, { each: true })
  languages!: string[];

  @IsArray()
  @ArrayMaxSize(LIMITS.skillCount)
  @IsString({ each: true })
  @MaxLength(LIMITS.skillLength, { each: true })
  frameworks!: string[];

  @IsArray()
  @ArrayMaxSize(LIMITS.skillCount)
  @IsString({ each: true })
  @MaxLength(LIMITS.skillLength, { each: true })
  databases!: string[];

  @IsArray()
  @ArrayMaxSize(LIMITS.skillCount)
  @IsString({ each: true })
  @MaxLength(LIMITS.skillLength, { each: true })
  tools!: string[];
}

class ParsedExperienceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.titleLength)
  company!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.titleLength)
  position!: string;

  @IsOptional()
  @Matches(YEAR_MONTH_PATTERN, { message: 'startDate must be YYYY-MM' })
  startDate?: string | null;

  @IsOptional()
  @Matches(YEAR_MONTH_PATTERN, { message: 'endDate must be YYYY-MM' })
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.descriptionLength)
  description?: string | null;

  @IsArray()
  @ArrayMaxSize(LIMITS.technologyCount)
  @IsString({ each: true })
  @MaxLength(LIMITS.skillLength, { each: true })
  technologies!: string[];
}

class ParsedEducationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.titleLength)
  institution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.titleLength)
  degree?: string | null;

  @IsOptional()
  @IsInt()
  @Min(LIMITS.minGraduationYear)
  @Max(LIMITS.maxGraduationYear)
  graduationYear?: number | null;
}

class ParsedProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.titleLength)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.descriptionLength)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.roleLength)
  role?: string | null;
}

// Same shape as CvParsedData. PATCH replaces the whole object.
export class UpdateParsedDataRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.summaryLength)
  summary?: string | null;

  @IsDefined()
  @ValidateNested()
  @Type(() => ParsedSkillsDto)
  skills!: ParsedSkillsDto;

  @IsArray()
  @ArrayMaxSize(LIMITS.experienceCount)
  @ValidateNested({ each: true })
  @Type(() => ParsedExperienceDto)
  experiences!: ParsedExperienceDto[];

  @IsArray()
  @ArrayMaxSize(LIMITS.educationCount)
  @ValidateNested({ each: true })
  @Type(() => ParsedEducationDto)
  education!: ParsedEducationDto[];

  @IsArray()
  @ArrayMaxSize(LIMITS.projectCount)
  @ValidateNested({ each: true })
  @Type(() => ParsedProjectDto)
  projects!: ParsedProjectDto[];
}
