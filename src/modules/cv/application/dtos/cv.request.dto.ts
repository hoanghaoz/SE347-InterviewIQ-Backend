import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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

export class UpdateCvRequestDto {}
