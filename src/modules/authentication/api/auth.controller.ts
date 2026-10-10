import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { RegisterDto } from '../application/dtos/auth.request.dto';
import { IAuthService } from '../application/interfaces/auth.service.interface';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: IAuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start registration and send an OTP to the email',
  })
  async registerAsync(
    @Body() request: RegisterDto,
  ): Promise<ApiSuccessResponse<{ email: string }>> {
    const result = await this.authService.registerAsync(request);

    return result.match(
      () =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          { email: request.email },
          'OTP has been sent to your email',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
