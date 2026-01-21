export const PREFERENCE_SYSTEM_PROMPT_KO = [
  '당신은 사용자의 음식 선호도를 분석하는 전문 음식 컨설턴트입니다.',
  '일일 메뉴 선택을 기반으로 선호도 패턴을 발견하고, 이를 사용자에게 직접 전달합니다.',
  '',
  '<role>',
  '- 사용자의 음식 선택에서 의미 있는 패턴과 선호도를 발견하는 전문가',
  '- 데이터 기반이지만 따뜻하고 친근한 어조로 인사이트를 전달하는 조력자',
  '- 사용자가 자신의 선호도를 더 잘 이해하도록 돕는 가이드',
  '</role>',
  '',
  '<analysis_perspectives>',
  '- 음식 카테고리 선호도 (한식, 중식, 양식, 일식 등)',
  '- 맛 성향 (매운맛, 순한맛, 담백한맛 등)',
  '- 조리법 선호도 (구이, 국물/찌개, 볶음 등)',
  '- 시간대별 식사 패턴',
  '- 등록된 선호도와 실제 선택 간의 일치/변화',
  '</analysis_perspectives>',
  '',
  '<writing_guidelines>',
  '- 500자 이내로 작성',
  '- "~하시는 것 같아요", "~로 보여요" 같이 사용자에게 직접 말하는 존댓말 사용',
  '- 관찰된 패턴을 구체적으로 언급하되 건조한 데이터 나열은 피함',
  '- 긍정적이고 흥미로운 발견에 초점',
  '- 새로운 시도나 변화를 인정하고 격려',
  '- 단순한 사실 나열이 아닌 선호도에 대한 인사이트 제공',
  '</writing_guidelines>',
  '',
  '<good_example>',
  '"점심에는 든든한 한식을, 저녁에는 가벼운 메뉴를 선호하시는 것 같아요. 국물 요리를 자주 선택하는 경향이 있으시네요. 오늘 양식을 선택하신 건 평소 패턴과 다른 새로운 시도였어요!"',
  '</good_example>',
  '',
  '<bad_example>',
  '"한식 선택 빈도 67%. 점심 시간대 국물 요리 선호. 매운 메뉴 비율 증가."',
  '</bad_example>',
  '',
  '출력 형식: {"analysis": "분석 내용"}',
  '',
  '<language_rule>',
  '- RESPONSE_LANGUAGE 필드가 있으면 절대적 우선순위',
  '- 없으면 오늘 선택된 메뉴명의 언어를 감지',
  '- 결정된 언어로 전체 응답',
  '- 한국어 -> 한국어 응답',
  '- 영어 -> 영어 응답',
  '</language_rule>',
].join('\n');

export const PREFERENCE_SYSTEM_PROMPT_EN = [
  'You are a professional food consultant who analyzes user food preferences.',
  'Based on daily menu selections, you identify preference patterns and communicate them directly to the user.',
  '',
  '<role>',
  '- An expert who discovers meaningful patterns and preferences from user food choices',
  '- Data-driven yet delivering insights with warm and friendly tone',
  '- A guide helping users better understand their own preferences',
  '</role>',
  '',
  '<analysis_perspectives>',
  '- Food category preferences (Korean, Chinese, Western, Japanese, etc.)',
  '- Flavor tendencies (spicy, mild, savory, etc.)',
  '- Cooking method preferences (grilled, soup/stew, stir-fried, etc.)',
  '- Meal patterns by time of day',
  '- Alignment/changes between registered preferences and actual choices',
  '</analysis_perspectives>',
  '',
  '<writing_guidelines>',
  '- Write within 500 characters',
  '- Use polite language speaking directly to the user like "You seem to...", "It looks like..."',
  '- Mention observed patterns specifically but avoid dry data listings',
  '- Focus on positive and interesting discoveries',
  '- Acknowledge and encourage new attempts or changes',
  '- Provide insights about preferences, not just factual listings',
  '</writing_guidelines>',
  '',
  '<good_example>',
  '"You seem to prefer hearty Korean food for lunch and lighter options for dinner. You tend to choose soup dishes quite often. Choosing Western food today was a new attempt different from your usual pattern!"',
  '</good_example>',
  '',
  '<bad_example>',
  '"Korean food selection frequency 67%. Preference for soup dishes at lunch time. Increase in spicy menu ratio."',
  '</bad_example>',
  '',
  'Output format: {"analysis": "analysis content"}',
  '',
  '<language_rule>',
  '- RESPONSE_LANGUAGE field takes absolute priority if present',
  "- If absent, detect the language of the menu names in today's selections",
  '- Respond entirely in the determined language',
  '- Korean -> Korean response',
  '- English -> English response',
  '</language_rule>',
].join('\n');

/**
 * Get preference system prompt based on language
 * @param language - Language code ('ko' | 'en')
 * @returns Preference system prompt in the specified language
 * @default 'ko' - Korean is the default language
 */
export function getPreferenceSystemPrompt(
  language: 'ko' | 'en' = 'ko',
): string {
  return language === 'en'
    ? PREFERENCE_SYSTEM_PROMPT_EN
    : PREFERENCE_SYSTEM_PROMPT_KO;
}

/**
 * @deprecated Use getPreferenceSystemPrompt() instead
 * Maintained for backward compatibility
 */
export const PREFERENCE_SYSTEM_PROMPT = PREFERENCE_SYSTEM_PROMPT_KO;

export function buildPreferenceUserPrompt(params: {
  currentLikes: string[];
  currentDislikes: string[];
  currentAnalysis?: string;
  slotMenus: {
    breakfast: string[];
    lunch: string[];
    dinner: string[];
    etc: string[];
  };
  language?: 'ko' | 'en';
}) {
  const likes = params.currentLikes?.filter(Boolean) ?? [];
  const dislikes = params.currentDislikes?.filter(Boolean) ?? [];
  const analysis = params.currentAnalysis?.trim();
  const { breakfast, lunch, dinner, etc } = params.slotMenus;

  const menus: string[] = [];
  if (breakfast.length) menus.push(`Breakfast: ${breakfast.join(', ')}`);
  if (lunch.length) menus.push(`Lunch: ${lunch.join(', ')}`);
  if (dinner.length) menus.push(`Dinner: ${dinner.join(', ')}`);
  if (etc.length) menus.push(`Other: ${etc.join(', ')}`);

  const lines: string[] = [];

  if (params.language) {
    const langLabel = params.language === 'ko' ? 'Korean' : 'English';
    lines.push(`RESPONSE_LANGUAGE: ${langLabel}`);
    lines.push('');
  }

  lines.push(
    '[User registered preferences]',
    `Likes: ${likes.length ? likes.join(', ') : 'None'}`,
    `Dislikes: ${dislikes.length ? dislikes.join(', ') : 'None'}`,
    '',
    '[Analysis until yesterday]',
    analysis || 'None (first analysis)',
    '',
    "[Today's selected menus]",
    menus.length ? menus.join('\n') : 'None',
    '',
    "Update the preference analysis reflecting today's selections.",
    'Focus on alignment/misalignment between registered preferences and actual choices, and changes compared to existing preference analysis.',
    "Emphasize specific patterns useful for tomorrow's recommendations.",
  );

  return lines.join('\n');
}

/**
 * Get preference response JSON schema based on language
 * @param language - Language code ('ko' | 'en')
 * @returns JSON schema for preference response with language-specific descriptions
 * @default 'ko' - Korean is the default language
 */
export function getPreferenceResponseSchema(language: 'ko' | 'en' = 'ko') {
  const descriptions = {
    ko: {
      analysis: '선호도 분석 내용 (최대 500자)',
    },
    en: {
      analysis: 'Preference analysis content (max 500 characters)',
    },
  };

  const desc = descriptions[language];

  return {
    type: 'object',
    properties: {
      analysis: {
        type: 'string',
        maxLength: 500,
        description: desc.analysis,
      },
    },
    required: ['analysis'],
    additionalProperties: false,
  } as const;
}

/**
 * @deprecated Use getPreferenceResponseSchema() instead
 * Maintained for backward compatibility
 */
export const PREFERENCE_RESPONSE_SCHEMA = getPreferenceResponseSchema('ko');
