import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendRegistrationOtpDto,
  ResetPasswordDto,
  VerifyPasswordResetOtpDto,
  VerifyRegistrationDto,
} from '../application/dtos/auth.request.dto';
import {
  LoginResponseDto,
  PasswordResetTokenResponseDto,
} from '../application/dtos/auth.response.dto';
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

  @Post('register/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a new registration OTP to the email',
  })
  async resendRegistrationOtpAsync(
    @Body() request: ResendRegistrationOtpDto,
  ): Promise<ApiSuccessResponse<{ email: string }>> {
    const result = await this.authService.resendRegistrationOtpAsync(request);

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
    summary: 'Verify the registration OTP, create the account and log in',
  })
  async verifyRegistrationAsync(
    @Body() request: VerifyRegistrationDto,
  ): Promise<ApiSuccessResponse<LoginResponseDto>> {
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in and get an access token and a refresh token',
  })
  async loginAsync(
    @Body() request: LoginDto,
  ): Promise<ApiSuccessResponse<LoginResponseDto>> {
    const result = await this.authService.loginAsync(request);

    return result.match(
      (data) => new ApiSuccessResponse(HttpStatus.OK, data, 'Login successful'),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and get a new access token',
  })
  async refreshAsync(
    @Body() request: RefreshTokenDto,
  ): Promise<ApiSuccessResponse<LoginResponseDto>> {
    const result = await this.authService.refreshAsync(request);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Token refreshed successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // Không cần access token: client vẫn logout được khi access token đã hết hạn
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out by revoking the refresh token of the current device',
  })
  async logoutAsync(
    @Body() request: RefreshTokenDto,
  ): Promise<ApiSuccessResponse<null>> {
    const result = await this.authService.logoutAsync(request);

    return result.match(
      () => new ApiSuccessResponse(HttpStatus.OK, null, 'Logout successful'),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a password reset OTP if the email is registered',
  })
  async requestPasswordResetAsync(
    @Body() request: ForgotPasswordDto,
  ): Promise<ApiSuccessResponse<null>> {
    const result = await this.authService.requestPasswordResetAsync(request);

    // Cùng một message cho mọi email để không lộ email nào đã đăng ký
    return result.match(
      () =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          null,
          'If the email is registered, an OTP has been sent',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // Tách khỏi bước đặt mật khẩu để OTP sai được báo ngay ở màn nhập OTP
  @Post('password/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify the password reset OTP and get a one-time reset token',
  })
  async verifyPasswordResetOtpAsync(
    @Body() request: VerifyPasswordResetOtpDto,
  ): Promise<ApiSuccessResponse<PasswordResetTokenResponseDto>> {
    const result = await this.authService.verifyPasswordResetOtpAsync(request);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'OTP verified successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with the reset token and log out everywhere',
  })
  async resetPasswordAsync(
    @Body() request: ResetPasswordDto,
  ): Promise<ApiSuccessResponse<null>> {
    const result = await this.authService.resetPasswordAsync(request);

    return result.match(
      () =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          null,
          'Password reset successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // Cần access token, khác hẳn luồng password/forgot dành cho người không đăng nhập được
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Change the password of the logged-in user and log out everywhere',
  })
  async changePasswordAsync(
    @User() user: JwtPayload,
    @Body() request: ChangePasswordDto,
  ): Promise<ApiSuccessResponse<null>> {
    const result = await this.authService.changePasswordAsync(
      user.sub,
      request,
    );

    // Mọi refresh token đã bị revoke nên client phải đăng nhập lại: nói rõ trong message
    return result.match(
      () =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          null,
          'Password changed successfully, please log in again',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
