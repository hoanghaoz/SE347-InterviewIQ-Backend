import { Module } from '@nestjs/common';
import { ICvRepository } from './domain/repositories/cv.repo.interface';
import { CvRepository } from './infrastructure/cv.repo';

@Module({
  controllers: [],
  providers: [
    {
      provide: ICvRepository,
      useClass: CvRepository,
    },
  ],
  exports: [ICvRepository],
})
export class CvModule {}
