export const PREFERENCE_SYSTEM_PROMPT = [
    '당신은 메뉴 추천 시스템의 취향 분석 모듈이다.',
    '매일 자정, 사용자의 오늘 메뉴 선택을 분석해 취향 변화를 추적한다.',
    '이 분석은 내일의 메뉴 추천 정확도를 높이는 데 사용된다.',
    '',
    '분석 목적:',
    '- 사용자가 등록한 정적 취향 정보를 보완',
    '- 실제 선택 행동에서 드러나는 동적 취향 포착',
    '- 시간 흐름에 따른 선호 변화 추적',
    '',
    '작성 방식:',
    '- 500자 이내, 데이터 기반 서술',
    '- 추천 시스템이 활용할 구체적 패턴 중심',
    '- "~를 좋아하십니다" 같은 사용자 대면 말투 금지 (시스템 내부 분석이므로)',
    '- 예: "최근 7일간 매운맛 메뉴 선택 빈도 증가", "저녁 시간대 한식 선호 강화"',
    '',
    '분석 요소:',
    '카테고리, 맛, 조리법, 재료, 시간대별 패턴',
    '',
    '변화 감지:',
    '- 어제 분석 대비 오늘 선택의 변화',
    '- 반복 패턴 vs 새로운 시도 구분',
    '- 단기 변동 vs 추세 변화 구분',
    '',
    '출력: {"analysis": "분석"}',
  ].join('\n');
  
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
  }) {
    const likes = params.currentLikes?.filter(Boolean) ?? [];
    const dislikes = params.currentDislikes?.filter(Boolean) ?? [];
    const analysis = params.currentAnalysis?.trim();
    const { breakfast, lunch, dinner, etc } = params.slotMenus;
  
    const menus: string[] = [];
    if (breakfast.length) menus.push(`아침: ${breakfast.join(', ')}`);
    if (lunch.length) menus.push(`점심: ${lunch.join(', ')}`);
    if (dinner.length) menus.push(`저녁: ${dinner.join(', ')}`);
    if (etc.length) menus.push(`기타: ${etc.join(', ')}`);
  
    return [
      '[사용자 등록 취향]',
      `좋아함: ${likes.length ? likes.join(', ') : '없음'}`,
      `싫어함: ${dislikes.length ? dislikes.join(', ') : '없음'}`,
      '',
      '[어제까지의 분석]',
      analysis || '없음 (첫 분석)',
      '',
      '[오늘 선택한 메뉴]',
      menus.length ? menus.join('\n') : '없음',
      '',
      '오늘 선택을 반영해 취향 분석을 업데이트하라.',
      '등록 취향과 실제 선택의 일치/불일치, 기존 취향 분석 대비 변화를 중심으로 서술.',
      '내일 추천에 활용할 구체적 패턴 위주로.',
    ].join('\n');
  }
  
  export const PREFERENCE_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      analysis: { type: 'string', maxLength: 500 },
    },
    required: ['analysis'],
    additionalProperties: false,
  } as const;