import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// PATCH: field vắng mặt nghĩa là giữ nguyên. Service từ chối body không có field nào.
export class UpdateUserProfileRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  // Khớp VarChar(255) của cột email
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  email?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'Full name must be a string' })
  // Chặn fullName là chuỗi rỗng hoặc toàn khoảng trắng sau khi trim
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(100, { message: 'Full name must not exceed 100 characters' })
  fullName?: string;
}
