import { ApiProperty } from '@nestjs/swagger';
import { ParseStatus } from '../../domain/enums/cv.enum';
import type { CvParsedData } from '../../domain/types/cv-parsed-data.type';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class CvResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  publicId!: string;

  @ApiProperty({ example: 'nguyen-van-a-cv.pdf' })
  fileName!: string;

  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1727500000/cvs/abc/nguyen-van-a-cv.pdf',
  })
  fileUrl!: string;

  @ApiProperty({ description: 'Size in bytes', example: 245760 })
  fileSize!: number;

  @ApiProperty({
    enum: ParseStatus,
    enumName: 'ParseStatus',
    example: ParseStatus.PENDING,
  })
  parseStatus!: ParseStatus;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description:
      'Shape: CvParsedData (domain/types/cv-parsed-data.type.ts). Null until parsed. Lists are [] when empty, never null.',
    example: {
      summary: 'Backend-oriented software engineering student',
      skills: {
        languages: ['TypeScript'],
        frameworks: ['NestJS'],
        databases: ['PostgreSQL'],
        tools: ['Docker'],
      },
      experiences: [
        {
          company: 'ABC Tech',
          position: 'Backend Intern',
          startDate: '2025-06',
          endDate: null,
          description: null,
          technologies: ['NestJS'],
        },
      ],
      education: [],
      projects: [],
    },
  })
  parsedData!: CvParsedData | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', example: '2026-09-28T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-28T10:00:00.000Z' })
  updatedAt!: string;
}

// One item of GET /api/cvs: no fileUrl / parsedData, to keep the list light.
export class CvSummaryResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  publicId!: string;

  @ApiProperty({ example: 'nguyen-van-a-cv.pdf' })
  fileName!: string;

  @ApiProperty({ description: 'Size in bytes', example: 245760 })
  fileSize!: number;

  @ApiProperty({
    enum: ParseStatus,
    enumName: 'ParseStatus',
    example: ParseStatus.PENDING,
  })
  parseStatus!: ParseStatus;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', example: '2026-09-28T10:00:00.000Z' })
  createdAt!: string;
}

// Everything the browser needs to upload straight to Cloudinary.
// Every signed field must be sent back to Cloudinary unchanged, or the signature fails.
export class CvSignedParamsResponseDto {
  @ApiProperty({
    example: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  })
  uploadUrl!: string;

  @ApiProperty({ example: '123456789012345' })
  apiKey!: string;

  @ApiProperty({ description: 'Unix time in seconds', example: 1727500000 })
  timestamp!: number;

  @ApiProperty({ example: 'a1b2c3d4e5f6...' })
  signature!: string;

  @ApiProperty({
    description: 'Send as `public_id`; the file is stored under this id',
    example: 'cvs/9b2e.../5d1f...',
  })
  cloudinaryPublicId!: string;

  @ApiProperty({ description: 'Send as `allowed_formats`', example: 'pdf' })
  allowedFormats!: string;
}
