import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getLanguageFromRequest } from '../utils/request-language.util';

/**
 * Extract language from request
 * Checks: user.preferredLanguage → Accept-Language header → X-Language header → 'ko' default
 */
export const RequestLanguage = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): 'ko' | 'en' => {
    const request = ctx.switchToHttp().getRequest();
    return getLanguageFromRequest(request);
  },
);
