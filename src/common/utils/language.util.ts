/**
 * Parse and validate language string to supported language type
 * @param input - Language string from user preferences or other sources
 * @returns 'ko' | 'en' - Defaults to 'ko' for any invalid or missing input
 */
export function parseLanguage(input: string | undefined | null): 'ko' | 'en' {
  return input === 'en' ? 'en' : 'ko';
}

/**
 * Detect the language of input text based on Korean/English character ratio
 * @param text - Input text to analyze
 * @returns 'ko' | 'en'
 * @default 'ko' - Returns Korean for empty input or text with no alphabetic characters
 */
export function detectLanguage(text: string): 'ko' | 'en' {
  if (!text || text.trim().length === 0) {
    return 'ko';
  }

  const koreanChars = (
    text.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g) || []
  ).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;

  if (koreanChars === 0 && englishChars === 0) {
    return 'ko';
  }

  return englishChars > koreanChars ? 'en' : 'ko';
}
