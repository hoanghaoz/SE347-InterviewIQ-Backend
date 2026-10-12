import { Module } from '@nestjs/common';
import { IUserRepository } from './domain/repositories/user.repo.interface';
import { UserRepository } from './infrastructure/user.repo';

@Module({
  controllers: [],
  providers: [
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
  ],
  exports: [IUserRepository],
})
export class UserModule {}
