import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Hides the playground (responds 404) unless ENABLE_LLM_PLAYGROUND=true, so a
 * deployed server does not expose a route that spends AI quota.
 */
@Injectable()
export class LlmPlaygroundEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('ENABLE_LLM_PLAYGROUND') !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
