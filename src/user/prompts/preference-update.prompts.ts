export const PREFERENCE_SYSTEM_PROMPT = [
  '당신은 Pick-Eat 앱의 사용자 취향을 분석하는 역할입니다.',
  '사용자의 좋아하는 것/싫어하는 것, 기존 취향 분석, 그리고 식사 시간대별(아침/점심/저녁/기타) 선택 메뉴를 모두 종합적으로 고려하여 취향 분석을 업데이트해주세요.',
  '분석 텍스트는 한국어 존댓말로 사용자에게 친근하게 설명하는 형식으로 작성해주세요.',
  '식사 시간대별 패턴과 선호도를 자연스럽게 반영하여 사용자의 식사 성향을 잘 드러내는 분석을 제공해주세요.',
  '반드시 다음 JSON 형식으로 응답해주세요: {"analysis": "분석 텍스트"}',
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
  const currentAnalysis = params.currentAnalysis?.trim();
  const slotMenus = params.slotMenus;

  const menuParts: string[] = [];
  if (slotMenus.breakfast.length > 0) {
    menuParts.push(`아침: ${slotMenus.breakfast.join(', ')}`);
  }
  if (slotMenus.lunch.length > 0) {
    menuParts.push(`점심: ${slotMenus.lunch.join(', ')}`);
  }
  if (slotMenus.dinner.length > 0) {
    menuParts.push(`저녁: ${slotMenus.dinner.join(', ')}`);
  }
  if (slotMenus.etc.length > 0) {
    menuParts.push(`기타: ${slotMenus.etc.join(', ')}`);
  }

  const parts = [
    `현재 좋아하는 것: ${likes.length ? likes.join(', ') : '없음'}`,
    `현재 싫어하는 것: ${dislikes.length ? dislikes.join(', ') : '없음'}`,
    currentAnalysis
      ? `기존 취향 분석: ${currentAnalysis}`
      : '기존 취향 분석: 없음',
    `최근 선택 메뉴 (식사 시간대별):`,
    menuParts.length > 0 ? menuParts.join('\n') : '없음',
    '위 정보를 종합적으로 고려하여, 좋아하는 것/싫어하는 것, 기존 취향 분석, 그리고 식사 시간대별 패턴을 모두 반영한 새로운 취향 분석을 존댓말 형식으로 작성해주세요.',
    '응답은 반드시 {"analysis": "분석 텍스트"} 형식의 JSON으로 작성해주세요.',
  ];
  return parts.join('\n');
}

export const PREFERENCE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      maxLength: 200,
    },
  },
  required: ['analysis'],
  additionalProperties: false,
} as const;
