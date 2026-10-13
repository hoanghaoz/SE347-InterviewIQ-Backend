import { ApiProperty } from '@nestjs/swagger';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT sent as "Authorization: Bearer <token>"',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  // DB chỉ lưu bản hash nên server không trả lại được token này lần nữa
  @ApiProperty({
    description: 'Opaque token used to get a new access token',
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  })
  refreshToken!: string;
}
