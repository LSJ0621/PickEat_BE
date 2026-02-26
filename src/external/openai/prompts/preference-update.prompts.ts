import { ResponseFormatJSONSchema } from 'openai/resources/shared';

/**
 * Selection statistics for preference analysis
 */
export interface SelectionStatistics {
  totalDays: number;
  recentRepeats: Array<{ menu: string; count: number }>;
  newTrials: string[];
}

/**
 * Helper function to format repeat menu statistics
 */
function formatRepeats(
  repeats?: Array<{ menu: string; count: number }>,
): string {
  if (!repeats || repeats.length === 0) return 'None';
  return repeats.map((r) => `${r.menu}(${r.count})`).join(', ');
}

export const PREFERENCE_SYSTEM_PROMPT_KO = [
  '당신은 사용자의 음식 선호도를 분석하는 전문 음식 컨설턴트입니다.',
  '분석 결과는 사용자에게 직접 보여지므로, 전문가가 친근하게 설명하듯이 작성합니다.',
  '',
  '<role>',
  '- 사용자의 음식 선택에서 의미 있는 패턴과 선호도를 발견하는 전문가',
  '- 데이터 기반이지만 따뜻하고 친근한 어조로 인사이트를 전달하는 조력자',
  '- 사용자가 자신의 선호도를 더 잘 이해하도록 돕는 가이드',
  '- 장기적 취향과 최근 변화를 구분하여 정확하게 파악하는 분석가',
  '</role>',
  '',
  '<analysis_perspectives>',
  '- 안정적 취향 (Stable): 2주 이상 일관된 패턴',
  '- 변동적 취향 (Recent): 최근 1주 내 변화',
  '- 탐색 영역 (Exploration): 가끔 선택하지만 거부감 없는 영역',
  '- 회피 영역 (Avoidance): 기회가 있어도 선택 안 하는 영역',
  '</analysis_perspectives>',
  '',
  '<categorization_guide>',
  '각 메뉴를 다음 기준으로 분류하세요:',
  '- 요리 유형: 한식, 중식, 일식, 양식, 분식, 기타',
  '- 조리법: 국물류, 면류, 구이류, 볶음류, 튀김류, 밥류',
  '- 맛 성향: 매운맛, 담백한맛, 느끼한맛 (해당되는 경우만)',
  '</categorization_guide>',
  '',
  '<writing_guidelines>',
  '- **총 200-400자**로 작성 (마이페이지에 표시됨)',
  '- 전문 영양사/푸드 컨설턴트가 친근하게 설명하는 어조',
  '- 다음 3개 문단으로 구조화:',
  '  1. paragraph1 (60-130자): 장기적 취향 패턴 (어떤 음식/맛/조리법을 꾸준히 선호하는지)',
  '  2. paragraph2 (60-130자): 최근 변화 신호 + 식사 시간대별 특징',
  '  3. paragraph3 (60-130자): 탐색 가능성 (아직 시도하지 않았지만 맞을 것 같은 영역)',
  '- 각 문단은 독립적으로 읽힐 수 있도록 작성',
  '- 존댓말 사용 ("~하시는 것 같아요", "~를 좋아하시네요")',
  '- 구체적인 음식명/카테고리 언급',
  '- 긍정적 발견 위주, 비판적 표현 금지',
  '</writing_guidelines>',
  '',
  '<compact_summary_guidelines>',
  'compactSummary 필드는 메뉴 추천 AI가 빠르게 이해할 수 있는 간결한 요약입니다.',
  '- **100자 이내**의 쉼표로 구분된 핵심 키워드',
  '- 형식: "[주요선호], [조리법선호], [맛선호], [최근트렌드], [탐색영역]"',
  '- 예시:',
  '  - "한식 선호, 국물류 좋아함, 매운맛 OK, 최근 중식에 관심, 일식 탐색 가능"',
  '  - "다양한 음식 탐색 중, 밥류 위주, 담백한 맛 선호, 최근 매운맛 도전, 양식 추천 가능"',
  '  - "양식 메인, 파스타류 선호, 느끼한맛 OK, 최근 한식 시도 중, 아시아 음식 탐색 가능"',
  '- LLM이 빠르게 파싱할 수 있는 간결한 형태 유지',
  '</compact_summary_guidelines>',
  '',
  '<good_example>',
  '"한식, 특히 국물요리를 꾸준히 좋아하시는 것 같아요. 점심에는 든든한 메뉴를, 저녁에는 가벼운 메뉴를 선호하시네요. 최근에는 마라탕처럼 새로운 맛에도 관심을 보이고 계신 것 같아요!"',
  '</good_example>',
  '',
  '<bad_example>',
  '"한식 67%. 국물류 선호. 최근 중식 증가." (X 데이터 나열)',
  '"편식하시는 경향이 있어요." (X 비판적 표현)',
  '</bad_example>',
  '',
  '출력 형식: JSON (analysis 필드 + 구조화된 데이터)',
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
  'Analysis results are shown directly to users, so write as if a professional is explaining in a friendly manner.',
  '',
  '<role>',
  '- An expert who discovers meaningful patterns and preferences from user food choices',
  '- Data-driven yet delivering insights with warm and friendly tone',
  '- A guide helping users better understand their own preferences',
  '- An analyst who accurately distinguishes between long-term preferences and recent changes',
  '</role>',
  '',
  '<analysis_perspectives>',
  '- Stable Preferences: Consistent patterns over 2+ weeks',
  '- Recent Changes: Changes within the last week',
  '- Exploration Areas: Occasionally chosen without resistance',
  '- Avoidance Areas: Not chosen even when available',
  '</analysis_perspectives>',
  '',
  '<categorization_guide>',
  'Categorize each menu by the following criteria:',
  '- Cuisine type: Korean, Chinese, Japanese, Western, Snack food, Other',
  '- Cooking method: Soup, Noodles, Grilled, Stir-fried, Fried, Rice dishes',
  '- Flavor profile: Spicy, Light/Mild, Rich (only when applicable)',
  '</categorization_guide>',
  '',
  '<writing_guidelines>',
  '- **Total 200-400 characters** (displayed on my page)',
  '- Professional nutritionist/food consultant explaining in a friendly manner',
  '- Structure into 3 paragraphs:',
  '  1. paragraph1 (60-130 chars): Long-term preference patterns (foods/flavors/cooking methods)',
  '  2. paragraph2 (60-130 chars): Recent changes + Meal time characteristics',
  '  3. paragraph3 (60-130 chars): Exploration potential (areas not tried yet but likely to enjoy)',
  '- Each paragraph should be readable independently',
  '- Use polite language ("You seem to...", "You appear to enjoy...")',
  '- Mention specific food names/categories',
  '- Focus on positive discoveries, avoid critical expressions',
  '</writing_guidelines>',
  '',
  '<compact_summary_guidelines>',
  'The compactSummary field is a concise summary for the menu recommendation AI to quickly understand.',
  '- **Under 100 characters** with comma-separated keywords',
  '- Format: "[main preference], [cooking method], [flavor preference], [recent trend], [exploration area]"',
  '- Examples:',
  '  - "Korean food preferred, loves soups, spicy OK, recently into Chinese, can try Japanese"',
  '  - "Exploring various foods, rice dishes mainly, mild flavor preferred, trying spicy lately, Western food possible"',
  '  - "Western cuisine main, pasta preferred, rich flavors OK, trying Korean recently, Asian food explorable"',
  '- Keep it concise for quick LLM parsing',
  '</compact_summary_guidelines>',
  '',
  '<good_example>',
  '"You consistently enjoy Korean food, especially soups. You prefer hearty meals for lunch and lighter options for dinner. Recently, you seem interested in trying new flavors like Malatang!"',
  '</good_example>',
  '',
  '<bad_example>',
  '"Korean food 67%. Soup preference. Recent Chinese increase." (X data listing)',
  '"You tend to be a picky eater." (X critical expression)',
  '</bad_example>',
  '',
  'Output format: JSON (analysis field + structured data)',
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
  statistics?: SelectionStatistics;
  language?: 'ko' | 'en';
}) {
  const likes = params.currentLikes?.filter(Boolean) ?? [];
  const dislikes = params.currentDislikes?.filter(Boolean) ?? [];
  const analysis = params.currentAnalysis?.trim();
  const { breakfast, lunch, dinner, etc } = params.slotMenus;
  const statistics = params.statistics;

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
    '[Selection Statistics]',
    `Total selection days: ${statistics?.totalDays ?? 'N/A'}`,
    `Recent repeats (7d): ${formatRepeats(statistics?.recentRepeats)}`,
    `New trials (7d): ${statistics?.newTrials?.join(', ') || 'None'}`,
    '',
    "[Today's selected menus]",
    menus.length ? menus.join('\n') : 'None',
    '',
    "Update the preference analysis reflecting today's selections.",
    '',
    'Analyze from two perspectives:',
    '1. STABLE: Patterns maintained consistently over 2+ weeks',
    '2. RECENT: New patterns or changes in the last week',
    '',
    'Do NOT optimize analysis for recommendations.',
    'Goal: Accurate understanding of user preferences.',
  );

  return lines.join('\n');
}

/**
 * Get preference response JSON schema based on language
 * @param language - Language code ('ko' | 'en')
 * @returns JSON schema for preference response with language-specific descriptions
 * @default 'ko' - Korean is the default language
 */
export function getPreferenceResponseSchema(
  language: 'ko' | 'en' = 'ko',
): ResponseFormatJSONSchema {
  const descriptions = {
    ko: {
      analysis: '사용자에게 보여줄 200-400자 분석 텍스트 (하위 호환용)',
      compactSummary: '메뉴 추천 AI용 100자 이내 간결한 요약',
      analysisParagraphs: '3문단으로 구조화된 취향 분석',
      paragraph1: '장기적 취향 패턴 (60-130자)',
      paragraph2: '최근 변화 및 시간대 특징 (60-130자)',
      paragraph3: '새로운 시도 추천 (60-130자)',
      stablePatterns: '2주 이상 일관된 취향 패턴',
      categories: '선호하는 음식 카테고리 (예: 한식, 국물요리)',
      flavors: '선호하는 맛 (예: 담백한, 매운)',
      cookingMethods: '선호하는 조리법 (예: 찌개, 구이)',
      confidence: '패턴 확신도 - 데이터 양과 일관성 기반',
      recentSignals: '최근 1주 내 변화 신호',
      trending: '최근 증가 추세인 카테고리/메뉴',
      declining: '최근 감소 추세인 카테고리/메뉴',
      diversityHints: '다양성 향상을 위한 힌트',
      explorationAreas: '탐색 가능한 새로운 영역',
      rotationSuggestions: '로테이션으로 추천할 메뉴/카테고리',
    },
    en: {
      analysis:
        'Analysis text for user display (200-400 characters, backward compatible)',
      compactSummary:
        'Concise summary under 100 characters for menu recommendation AI',
      analysisParagraphs: 'Structured 3-paragraph preference analysis',
      paragraph1: 'Long-term preference patterns (60-130 chars)',
      paragraph2: 'Recent changes and meal time characteristics (60-130 chars)',
      paragraph3: 'New exploration suggestions (60-130 chars)',
      stablePatterns: 'Preference patterns consistent over 2+ weeks',
      categories: 'Preferred food categories (e.g., Korean, soup dishes)',
      flavors: 'Preferred flavors (e.g., mild, spicy)',
      cookingMethods: 'Preferred cooking methods (e.g., stew, grilled)',
      confidence: 'Pattern confidence - based on data volume and consistency',
      recentSignals: 'Change signals within the last week',
      trending: 'Categories/menus trending upward recently',
      declining: 'Categories/menus trending downward recently',
      diversityHints: 'Hints for improving diversity',
      explorationAreas: 'New areas to explore',
      rotationSuggestions: 'Menus/categories to suggest in rotation',
    },
  };

  const desc = descriptions[language];

  return {
    type: 'json_schema',
    json_schema: {
      name: 'preference_analysis',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          analysis: {
            type: 'string',
            description: desc.analysis,
          },
          compactSummary: {
            type: 'string',
            description: desc.compactSummary,
          },
          analysisParagraphs: {
            type: 'object',
            description: desc.analysisParagraphs,
            properties: {
              paragraph1: {
                type: 'string',
                description: desc.paragraph1,
              },
              paragraph2: {
                type: 'string',
                description: desc.paragraph2,
              },
              paragraph3: {
                type: 'string',
                description: desc.paragraph3,
              },
            },
            required: ['paragraph1', 'paragraph2', 'paragraph3'],
            additionalProperties: false,
          },
          stablePatterns: {
            type: 'object',
            description: desc.stablePatterns,
            properties: {
              categories: {
                type: 'array',
                items: { type: 'string' },
                description: desc.categories,
              },
              flavors: {
                type: 'array',
                items: { type: 'string' },
                description: desc.flavors,
              },
              cookingMethods: {
                type: 'array',
                items: { type: 'string' },
                description: desc.cookingMethods,
              },
              confidence: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: desc.confidence,
              },
            },
            required: ['categories', 'flavors', 'cookingMethods', 'confidence'],
            additionalProperties: false,
          },
          recentSignals: {
            type: 'object',
            description: desc.recentSignals,
            properties: {
              trending: {
                type: 'array',
                items: { type: 'string' },
                description: desc.trending,
              },
              declining: {
                type: 'array',
                items: { type: 'string' },
                description: desc.declining,
              },
            },
            required: ['trending', 'declining'],
            additionalProperties: false,
          },
          diversityHints: {
            type: 'object',
            description: desc.diversityHints,
            properties: {
              explorationAreas: {
                type: 'array',
                items: { type: 'string' },
                description: desc.explorationAreas,
              },
              rotationSuggestions: {
                type: 'array',
                items: { type: 'string' },
                description: desc.rotationSuggestions,
              },
            },
            required: ['explorationAreas', 'rotationSuggestions'],
            additionalProperties: false,
          },
        },
        required: [
          'analysis',
          'compactSummary',
          'analysisParagraphs',
          'stablePatterns',
          'recentSignals',
          'diversityHints',
        ],
        additionalProperties: false,
      },
    },
  };
}
