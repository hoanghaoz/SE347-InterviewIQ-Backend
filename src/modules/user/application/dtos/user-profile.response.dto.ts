import { ApiProperty } from '@nestjs/swagger';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class UserProfileResponseDto {
  // publicId của user. Id nội bộ (auto increment) không bao giờ ra khỏi backend.
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  id!: string;

  @ApiProperty({ example: 'nguyenvana@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  fullName!: string;

  @ApiProperty({
    nullable: true,
    description: 'Null until the user uploads an avatar',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1727500000/avatars/3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11.jpg',
  })
  avatarUrl!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-01-05T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-02-11T03:15:42.000Z' })
  updatedAt!: string;
}

export class AvatarUploadResponseDto {
  @ApiProperty({
    description:
      'URL của ảnh vừa upload. Mỗi lần upload sinh version mới nên URL luôn khác lần trước.',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1727500000/avatars/3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11.jpg',
  })
  avatarUrl!: string;
}
