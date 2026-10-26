import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CvController } from './cv.controller';

describe('CvController', () => {
  const reflector = new Reflector();
  const prototype = CvController.prototype as unknown as Record<
    string,
    unknown
  >;
  const routeNames = Object.getOwnPropertyNames(prototype).filter(
    (name) =>
      name !== 'constructor' &&
      typeof prototype[name] === 'function' &&
      Reflect.hasMetadata(METHOD_METADATA, prototype[name] as object),
  );

  it('finds the 6 CV routes', () => {
    expect(routeNames.sort()).toEqual([
      'createCvAsync',
      'createSignedParamsAsync',
      'getCvAsync',
      'getCvsAsync',
      'parseCvAsync',
      'updateParsedDataAsync',
    ]);
  });

  // RolesGuard reads @Roles from the handler (method). A class-level @Auth puts the
  // metadata on the class instead, and every request then fails with 403.
  it.each([
    'createCvAsync',
    'createSignedParamsAsync',
    'getCvAsync',
    'getCvsAsync',
    'parseCvAsync',
    'updateParsedDataAsync',
  ])('%s has @Roles on the method, so RolesGuard can read it', (name) => {
    const handler = prototype[name] as (...args: never[]) => unknown;

    expect(reflector.get(Roles, handler)).toEqual([
      CommonUserRole.ADMIN,
      CommonUserRole.USER,
    ]);
    expect(Reflect.hasMetadata(PATH_METADATA, handler)).toBe(true);
  });
});
