import { applyDecorators, UseGuards } from '@nestjs/common';
import { CommonUserRole } from '../common/commonEnum';
import { RolesGuard } from './roles.guard';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Roles } from './roles.decorator';

export function Auth(roles: CommonUserRole[]) {
  return applyDecorators(UseGuards(RolesGuard), ApiBearerAuth(), Roles(roles), ApiUnauthorizedResponse({ description: 'Unauthorized' });
}
