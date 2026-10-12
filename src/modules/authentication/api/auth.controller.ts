import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import {
  RegisterDto,
  VerifyRegistrationDto,
} from '../application/dtos/auth.request.dto';
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

  @Post('register/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Verify the registration OTP and create the account',
  })
  async verifyRegistrationAsync(
    @Body() request: VerifyRegistrationDto,
  ): Promise<ApiSuccessResponse<{ email: string }>> {
    const result = await this.authService.verifyRegistrationAsync(request);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.CREATED,
          data,
          'Account created successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
