import { Reflector } from '@nestjs/core';
import { CommonUserRole } from '../common/commonEnum';

// default setting is string[], but recommend to use enum type for better type safety
export const Roles = Reflector.createDecorator<CommonUserRole[]>();
