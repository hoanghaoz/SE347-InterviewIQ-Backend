import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { PlaygroundRunResponseDto } from '../application/dtos/playground-run.response.dto';
import { RunPlaygroundRequestDto } from '../application/dtos/run-playground.request.dto';
import { ILlmPlaygroundService } from '../application/interfaces/llm-playground.service.interface';
import { LlmPlaygroundEnabledGuard } from './llm-playground-enabled.guard';
import { LLM_PLAYGROUND_HTML } from './llm-playground.page';

@ApiTags('llm-playground')
@Controller('api/internal/llm-playground')
@UseGuards(LlmPlaygroundEnabledGuard)
export class LlmPlaygroundController {
  constructor(private readonly playgroundService: ILlmPlaygroundService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Internal prompt playground page (dev only)' })
  getPage(): string {
    return LLM_PLAYGROUND_HTML;
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run a prompt against an LLM provider (dev only)' })
  async run(
    @Body() request: RunPlaygroundRequestDto,
  ): Promise<ApiSuccessResponse<PlaygroundRunResponseDto>> {
    const result = await this.playgroundService.runAsync(request);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Prompt executed successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
