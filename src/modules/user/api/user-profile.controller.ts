import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { UpdateUserProfileRequestDto } from '../application/dtos/user-profile.request.dto';
import {
  AvatarUploadResponseDto,
  UserProfileResponseDto,
} from '../application/dtos/user-profile.response.dto';
import type { AvatarUpload } from '../application/interfaces/avatar-storage.interface';
import { IUserProfileService } from '../application/interfaces/user-profile.service.interface';
import { MAX_AVATAR_BYTES } from '../domain/constants/avatar.constant';

// Thin controller: read input, call the service, turn Result into HTTP.
// Chỉ thao tác trên chính chủ token: không route nào nhận user id từ client.
@ApiTags('users')
@Controller('api/users/me')
export class UserProfileController {
  constructor(private readonly userProfileService: IUserProfileService) {}

  // @Auth phải đặt trên từng method: RolesGuard đọc metadata bằng
  // reflector.get(Roles, context.getHandler()) nên không thấy metadata ở class.
  @Get()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({ summary: 'Get the profile of the logged-in user' })
  async getMyProfileAsync(
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<UserProfileResponseDto>> {
    const result = await this.userProfileService.getProfileAsync(user.sub);

    return result.match(
      (dto) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          dto,
          'Profile retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Patch()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({ summary: 'Update the email and/or full name of the user' })
  async updateMyProfileAsync(
    @User() user: JwtPayload,
    @Body() request: UpdateUserProfileRequestDto,
  ): Promise<ApiSuccessResponse<UserProfileResponseDto>> {
    const result = await this.userProfileService.updateProfileAsync(
      user.sub,
      request,
    );

    return result.match(
      (dto) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          dto,
          'Profile updated successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // multer giữ file trong RAM (không ghi đĩa) và cắt ngang ngay khi vượt
  // MAX_AVATAR_BYTES, nên một file khổng lồ không bao giờ được nạp hết vào bộ nhớ.
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG or WEBP, tối đa 2 MB',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a new avatar and get its URL' })
  async uploadMyAvatarAsync(
    @User() user: JwtPayload,
    @UploadedFile() file: AvatarUpload | undefined,
  ): Promise<ApiSuccessResponse<AvatarUploadResponseDto>> {
    const result = await this.userProfileService.updateAvatarAsync(
      user.sub,
      file,
    );

    return result.match(
      (dto) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          dto,
          'Avatar uploaded successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
