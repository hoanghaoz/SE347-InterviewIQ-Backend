import {
  BadRequestException,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './shared/common/logger.middleware';
import { ErrorCode } from './shared/common/errorCode';
import { mapValidationErrors } from './shared/common/validation-error.mapper';
import { PrismaModule } from './shared/infrastructure/database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    ConfigModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          exceptionFactory: (errors) =>
            new BadRequestException({
              code: ErrorCode.BadRequest,
              message: 'Request validation failed',
              errors: mapValidationErrors(errors),
            }),
        }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'api/*path', method: RequestMethod.ALL });
  }
}
