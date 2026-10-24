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
import { CreateCvRequestDto } from '../application/dtos/cv.request.dto';
import {
  CvResponseDto,
  CvSignedParamsResponseDto,
  CvSummaryResponseDto,
} from '../application/dtos/cv.response.dto';
import { ICvService } from '../application/interfaces/cv.service.interface';

// Thin controller: read input, call the service, turn Result into HTTP.
// @Auth is repeated on every route on purpose: RolesGuard reads @Roles from the
// handler (method), not the class, so a class-level @Auth makes every route 403.
@Controller('api/cvs')
export class CvController {
  constructor(private readonly cvService: ICvService) {}

  // Step 1 of the upload: permission to upload one PDF straight to Cloudinary.
  @Post('signed-params')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async createSignedParamsAsync(
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<CvSignedParamsResponseDto>> {
    const result = await this.cvService.createSignedParamsAsync(user.sub);

    return result.match(
      (dto) =>
        new ApiSuccessResponse(HttpStatus.OK, dto, 'Upload params signed'),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // Step 2: after the browser uploaded the file, save the CV metadata.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async createCvAsync(
    @User() user: JwtPayload,
    @Body() request: CreateCvRequestDto,
  ): Promise<ApiSuccessResponse<CvResponseDto>> {
    const result = await this.cvService.createCvAsync(user.sub, request);

    return result.match(
      (dto) =>
        new ApiSuccessResponse(
          HttpStatus.CREATED,
          dto,
          'CV created successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Get()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async getCvsAsync(
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<CvSummaryResponseDto[]>> {
    const result = await this.cvService.getCvsAsync(user.sub);

    return result.match(
      (dtos) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          dtos,
          'CVs retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Get(':id')
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async getCvAsync(
    @User() user: JwtPayload,
    // Rejects non-UUID ids with 400 before they reach the database.
    @Param('id', ParseUUIDPipe) cvPublicId: string,
  ): Promise<ApiSuccessResponse<CvResponseDto>> {
    const result = await this.cvService.getCvAsync(user.sub, cvPublicId);

    return result.match(
      (dto) =>
        new ApiSuccessResponse(HttpStatus.OK, dto, 'CV retrieved successfully'),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
