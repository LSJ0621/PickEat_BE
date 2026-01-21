import { Request } from 'express';
import { parseLanguage } from './language.util';

/**
 * Extract language from Express request
 * Priority: user.preferredLanguage → Accept-Language → X-Language → 'ko' default
 */
export function getLanguageFromRequest(
  request: Request & { user?: { preferredLanguage?: string } },
): 'ko' | 'en' {
  // 1. Check authenticated user's preferred language
  if (request.user?.preferredLanguage) {
    return parseLanguage(request.user.preferredLanguage);
  }

  // 2. Check Accept-Language header
  const acceptLanguage = request.headers?.['accept-language'];
  if (acceptLanguage) {
    const primaryLang = acceptLanguage.split(',')[0].split('-')[0].trim();
    return parseLanguage(primaryLang);
  }

  // 3. Check custom X-Language header
  const xLanguage = request.headers?.['x-language'];
  if (xLanguage) {
    return parseLanguage(xLanguage as string);
  }

  // 4. Default to Korean
  return 'ko';
}
