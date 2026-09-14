import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  // Init logger with tag 'HTTP' to differentiate logs from other parts of the application
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length') || 0;
      const duration = Date.now() - startTime;

      // Log: POST /api/auth/login 201 150 - PostmanRuntime [12ms]
      if (statusCode >= 500) {
        this.logger.error(
          `${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} [${duration}ms]`,
        );
      } else if (statusCode >= 400) {
        this.logger.warn(
          `${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} [${duration}ms]`,
        );
      } else {
        this.logger.log(
          `${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} [${duration}ms]`,
        );
      }
    });

    next();
  }
}
