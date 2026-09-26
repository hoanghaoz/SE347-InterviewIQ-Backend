import { applyDecorators, UseGuards } from '@nestjs/common';
import { CommonUserRole } from '../common/commonEnum';
import { RolesGuard } from './roles.guard';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from '../common/jwt.guard';

export function Auth(roles: CommonUserRole[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    Roles(roles),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}
