import { detectLanguage } from '@/common/utils/language.util';
import type { ValidationContext } from '@/menu/interfaces/menu-validation.interface';
import type { WebSearchSummary } from '@/menu/interfaces/web-search-summary.interface';
import type { StructuredAnalysis } from '@/user/interfaces/user-taste-analysis.interface';

// Re-export StructuredAnalysis for backward compatibility
export type { StructuredAnalysis };

// Re-export system prompts for backward compatibility
export {
  SYSTEM_PROMPT_KO,
  SYSTEM_PROMPT_EN,
  SYSTEM_PROMPT,
  getSystemPrompt,
} from '@/external/openai/prompts/menu-recommendation-system.prompts';

export {
  SYSTEM_PROMPT_WITH_WEB_SEARCH_KO,
  SYSTEM_PROMPT_WITH_WEB_SEARCH_EN,
  getSystemPromptWithWebSearch,
} from '@/external/openai/prompts/menu-recommendation-web-search.prompts';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate age group from birth year
 * @param birthYear - User's birth year
 * @returns Age group string in Korean
 */
export function getAgeGroup(birthYear: number): string {
  const age = new Date().getFullYear() - birthYear;
  if (age < 20) return '10대';
  if (age < 30) return '20대';
  if (age < 40) return '30대';
  if (age < 50) return '40대';
  if (age < 60) return '50대';
  return '60대 이상';
}

/**
 * Calculate age group from birth year (English version)
 * @param birthYear - User's birth year
 * @returns Age group string in English
 */
export function getAgeGroupEN(birthYear: number): string {
  const age = new Date().getFullYear() - birthYear;
  if (age < 20) return 'teens';
  if (age < 30) return '20s';
  if (age < 40) return '30s';
  if (age < 50) return '40s';
  if (age < 60) return '50s';
  return '60s or older';
}

// ============================================================================
// User Prompt Builders
// ============================================================================

export function buildUserPrompt(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
  analysis?: string,
  language?: 'ko' | 'en',
  compactSummary?: string,
  structuredAnalysis?: StructuredAnalysis,
): string {
  const responseLanguage = language || detectLanguage(userPrompt);
  const langLabel = responseLanguage === 'ko' ? 'Korean' : 'English';

  const lines = [
    `RESPONSE_LANGUAGE: ${langLabel}`,
    '',
    '<user_prompt>',
    userPrompt,
    '</user_prompt>',
    '---',
    'PREFERENCES (use only what is needed):',
    `Likes: ${likes?.length ? likes.join(', ') : 'None'}`,
    `Dislikes: ${dislikes?.length ? dislikes.join(', ') : 'None'}`,
    '---',
  ];

  // compactSummary 사용 (토큰 절감), 없으면 analysis로 fallback
  if (compactSummary) {
    lines.push('PREFERENCE_ANALYSIS:', compactSummary);
  } else if (analysis) {
    lines.push('PREFERENCE_ANALYSIS:', analysis.trim());
  } else {
    lines.push('PREFERENCE_ANALYSIS:', 'None');
  }

  // Add structured analysis data if available
  if (structuredAnalysis) {
    lines.push('---');
    lines.push('STRUCTURED_PREFERENCE_ANALYSIS:');

    if (structuredAnalysis.stablePatterns) {
      const sp = structuredAnalysis.stablePatterns;
      lines.push(`Stable Patterns (confidence: ${sp.confidence}):`);
      lines.push(`  Categories: ${sp.categories.join(', ')}`);
      lines.push(`  Flavors: ${sp.flavors.join(', ')}`);
      lines.push(`  Cooking Methods: ${sp.cookingMethods.join(', ')}`);
    }

    if (structuredAnalysis.recentSignals) {
      const rs = structuredAnalysis.recentSignals;
      lines.push(`Recent Signals:`);
      lines.push(`  Trending (max 1): ${rs.trending.join(', ')}`);
      lines.push(`  Declining (NEVER recommend): ${rs.declining.join(', ')}`);
    }

    if (structuredAnalysis.diversityHints) {
      const dh = structuredAnalysis.diversityHints;
      lines.push(
        `Exploration Areas (include at least 1): ${dh.explorationAreas.join(', ')}`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Generate user prompt with Stage 1 validation context
 * (for 2-stage recommendation system)
 */
export function buildUserPromptWithValidation(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
  analysis: string | undefined,
  validationContext: {
    intent: string;
    constraints: {
      budget?: string;
      dietary?: string[];
      urgency?: string;
    };
    suggestedCategories: string[];
  },
  language?: 'ko' | 'en',
  compactSummary?: string,
  structuredAnalysis?: StructuredAnalysis,
): string {
  const basePrompt = buildUserPrompt(
    userPrompt,
    likes,
    dislikes,
    analysis,
    language,
    compactSummary,
    structuredAnalysis,
  );

  const validationInfo = [
    '---',
    'VALIDATION_CONTEXT (Stage 1 analysis result):',
    `Intent: ${validationContext.intent}`,
  ];

  if (validationContext.constraints.budget) {
    validationInfo.push(`Budget: ${validationContext.constraints.budget}`);
  }

  if (
    validationContext.constraints.dietary &&
    validationContext.constraints.dietary.length > 0
  ) {
    validationInfo.push(
      `Dietary restrictions: ${validationContext.constraints.dietary.join(', ')}`,
    );
  }

  if (validationContext.constraints.urgency) {
    validationInfo.push(`Urgency: ${validationContext.constraints.urgency}`);
  }

  if (validationContext.suggestedCategories.length > 0) {
    validationInfo.push(
      `Suggested categories: ${validationContext.suggestedCategories.join(', ')}`,
    );
  }

  return [basePrompt, ...validationInfo].join('\n');
}

// ============================================================================
// JSON Schema
// ============================================================================

/**
 * Get menu recommendations JSON schema based on language
 * @param language - Language code ('ko' | 'en')
 * @returns JSON schema for menu recommendations with language-specific descriptions
 * @default 'ko' - Korean is the default language
 */
export function getMenuRecommendationsJsonSchema(language: 'ko' | 'en' = 'ko') {
  const descriptions = {
    ko: {
      intro: '첫 설명 (3-4줄, 전체적인 메뉴 추천 이유 포함)',
      recommendations:
        '조건 + 메뉴 배열. 각 항목은 condition(상황/기분)과 menu(정규화된 메뉴명) 포함',
      condition: '해당 메뉴가 적합한 상황/기분 (~하다면 형태)',
      menu: '구체적인 단일 요리명 (정규화된 메뉴명)',
      closing: '마무리 말 (1-2문장)',
    },
    en: {
      intro:
        'Opening explanation (3-4 lines, including overall recommendation reasons)',
      recommendations:
        'Condition + menu array. Each item includes condition (situation/mood) and menu (normalized menu name)',
      condition: 'Situation/mood suitable for the menu (If you want ~ format)',
      menu: 'Specific single dish name (normalized menu name)',
      closing: 'Closing remark (1-2 sentences)',
    },
  };

  const desc = descriptions[language];

  return {
    type: 'object',
    properties: {
      intro: {
        type: 'string',
        minLength: 50,
        maxLength: 500,
        description: desc.intro,
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            condition: {
              type: 'string',
              minLength: 5,
              maxLength: 100,
              description: desc.condition,
            },
            menu: {
              type: 'string',
              minLength: 1,
              maxLength: 50,
              description: desc.menu,
            },
          },
          required: ['condition', 'menu'],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 5,
        description: desc.recommendations,
      },
      closing: {
        type: 'string',
        minLength: 10,
        maxLength: 200,
        description: desc.closing,
      },
    },
    required: ['intro', 'recommendations', 'closing'],
    additionalProperties: false,
  } as const;
}

/**
 * @deprecated Use getMenuRecommendationsJsonSchema() instead
 * Maintained for backward compatibility
 */
export const MENU_RECOMMENDATIONS_JSON_SCHEMA =
  getMenuRecommendationsJsonSchema('ko');

// ============================================================================
// User Profile Builders
// ============================================================================

/**
 * User profile for web search-based recommendations
 */
export interface UserProfile {
  country?: string;
  ageGroup?: string;
  gender?: string;
}

/**
 * Build user prompt with address and profile for web search-based recommendations
 * Adds user address and profile information to enable location and demographic-aware recommendations
 * @param prompt - User's request
 * @param likes - User's liked foods
 * @param dislikes - User's disliked foods
 * @param analysis - Preference analysis from recent patterns
 * @param validationContext - Stage 1 validation context
 * @param userAddress - User's address for location-aware recommendations
 * @param userProfile - User's demographic profile (country, age group, gender)
 * @param language - Language code ('ko' | 'en')
 * @param compactSummary - Compact summary for token efficiency
 * @param structuredAnalysis - Structured preference analysis
 * @param webSearchSummary - Pre-fetched web search summary from Call A
 * @returns User prompt with address and profile information
 */
export function buildUserPromptWithAddress(
  prompt: string,
  likes: string[],
  dislikes: string[],
  analysis?: string,
  validationContext?: ValidationContext,
  userAddress?: string,
  userProfile?: UserProfile,
  language?: 'ko' | 'en',
  compactSummary?: string,
  structuredAnalysis?: StructuredAnalysis,
  webSearchSummary?: WebSearchSummary | null,
): string {
  // Use existing function to build base prompt
  const basePrompt = validationContext
    ? buildUserPromptWithValidation(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        language,
        compactSummary,
        structuredAnalysis,
      )
    : buildUserPrompt(
        prompt,
        likes,
        dislikes,
        analysis,
        language,
        compactSummary,
        structuredAnalysis,
      );

  const sections: string[] = [basePrompt];

  // Add user profile section if provided
  if (
    userProfile &&
    (userProfile.country || userProfile.ageGroup || userProfile.gender)
  ) {
    const profileLabel =
      language === 'en'
        ? 'USER_PROFILE (reference only)'
        : 'USER_PROFILE (참고용)';

    const profileLines = [profileLabel + ':'];
    if (userProfile.country) {
      profileLines.push(
        language === 'en'
          ? `  Country: ${userProfile.country}`
          : `  국가: ${userProfile.country}`,
      );
    }
    if (userProfile.ageGroup) {
      profileLines.push(
        language === 'en'
          ? `  Age Group: ${userProfile.ageGroup}`
          : `  연령대: ${userProfile.ageGroup}`,
      );
    }
    if (userProfile.gender) {
      profileLines.push(
        language === 'en'
          ? `  Gender: ${userProfile.gender}`
          : `  성별: ${userProfile.gender}`,
      );
    }

    sections.push('---', ...profileLines);
  }

  // Add user address section if provided (without web_search instruction)
  if (userAddress) {
    const addressLabel =
      language === 'en'
        ? 'USER_ADDRESS (location reference)'
        : 'USER_ADDRESS (위치 참고)';
    sections.push('---', `${addressLabel}:`, userAddress);
  }

  // Add web search summary from Call A (if confidence is not low)
  if (webSearchSummary && webSearchSummary.confidence !== 'low') {
    const localTrendsLabel =
      language === 'en'
        ? 'LOCAL_TRENDS (reference only, user preferences take priority)'
        : 'LOCAL_TRENDS (참고용, 사용자 선호도 우선)';
    sections.push('---', localTrendsLabel + ':');

    if (webSearchSummary.localTrends.length > 0) {
      const localLabel =
        language === 'en' ? '  Local popular:' : '  지역 인기:';
      sections.push(`${localLabel} ${webSearchSummary.localTrends.join(', ')}`);
    }

    if (webSearchSummary.demographicFavorites.length > 0) {
      const demoLabel =
        language === 'en' ? '  Demographic popular:' : '  인구통계 인기:';
      sections.push(
        `${demoLabel} ${webSearchSummary.demographicFavorites.join(', ')}`,
      );
    }

    if (webSearchSummary.seasonalItems.length > 0) {
      const seasonLabel = language === 'en' ? '  Seasonal:' : '  계절 메뉴:';
      sections.push(
        `${seasonLabel} ${webSearchSummary.seasonalItems.join(', ')}`,
      );
    }

    if (webSearchSummary.summary) {
      const summaryLabel = language === 'en' ? '  Summary:' : '  요약:';
      sections.push(`${summaryLabel} ${webSearchSummary.summary}`);
    }
  }

  return sections.join('\n');
}

/**
 * Build user profile from user data
 * @param birthYear - User's birth year (extracted from birthDate)
 * @param gender - User's gender ('male' | 'female' | 'other')
 * @param country - Country extracted from address (optional)
 * @param language - Language code ('ko' | 'en')
 * @returns UserProfile object
 */
export function buildUserProfile(
  birthYear?: number,
  gender?: string,
  country?: string,
  language: 'ko' | 'en' = 'ko',
): UserProfile {
  const profile: UserProfile = {};

  if (country) {
    profile.country = country;
  }

  if (birthYear) {
    const currentYear = new Date().getFullYear();
    if (birthYear >= 1900 && birthYear <= currentYear) {
      profile.ageGroup =
        language === 'en' ? getAgeGroupEN(birthYear) : getAgeGroup(birthYear);
    }
  }

  if (gender && ['male', 'female', 'other'].includes(gender)) {
    const genderMap: Record<string, Record<string, string>> = {
      ko: {
        male: '남성',
        female: '여성',
        other: '기타',
      },
      en: {
        male: 'Male',
        female: 'Female',
        other: 'Other',
      },
    };
    profile.gender = genderMap[language][gender] || gender;
  }

  return profile;
}
