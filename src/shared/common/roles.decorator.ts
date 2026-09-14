import { Reflector } from '@nestjs/core';

// default setting is string[], but recommend to use enum type for better type safety
export const Roles = Reflector.createDecorator<string[]>();
