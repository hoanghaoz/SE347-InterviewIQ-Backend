import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { CreateCheatLogRequestDto } from '../application/dtos/cheat-log.request.dto';
import {
  CheatLogCreatedResponseDto,
  CheatLogListResponseDto,
} from '../application/dtos/cheat-log.response.dto';
import { ICheatLogService } from '../application/interfaces/cheat-log.service.interface';

@Controller('api/interview-session/:sessionPublicId/cheat-logs')
export class InterviewCheatLogController {
  constructor(private readonly cheatLogService: ICheatLogService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async recordCheatEventAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Body() request: CreateCheatLogRequestDto,
  ): Promise<ApiSuccessResponse<CheatLogCreatedResponseDto>> {
    const result = await this.cheatLogService.recordCheatEventAsync(
      user.sub,
      sessionPublicId,
      request,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.CREATED,
          data,
          'Cheat event recorded',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async getCheatLogsAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
  ): Promise<ApiSuccessResponse<CheatLogListResponseDto>> {
    const result = await this.cheatLogService.getCheatLogsAsync(
      user.sub,
      sessionPublicId,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Cheat logs retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
