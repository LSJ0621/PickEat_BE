export const PREFERENCE_SYSTEM_PROMPT = [
  '역할: 음식 취향 분석 전문가. 목표: 사용자 메뉴 선택 패턴을 바탕으로 선호도 분석.',
  '',
  '[스타일]',
  '- 말투: 전문가가 설명하듯이 자연스럽고 차분한 문장체.',
  '- 분량: 공백 포함 500자 이내로 핵심만.',
  '- 형식: 리스트/불릿 대신 짧은 단락.',
  '',
  '[원칙]',
  '- 사실 기반 패턴만 설명, 심리 해석/추측 금지.',
  '- 같은 내용 반복 금지, 수식어 남용 금지.',
  '- 메뉴 이름을 길게 나열하지 말고, 거기서 보이는 특징만 요약.',
  '',
  '[분석 항목]',
  '- 선호 메뉴 카테고리',
  '- 선호 맛',
  '- 선호 음식 스타일/조리 방식',
  '- 재료·토핑 선호',
  '- 시간대별 선호 패턴',
  '',
  '[변화 분석]',
  '- 기준: 기존 취향 분석 + 기존 취향 정보.',
  '- 오늘/최근 선택이 선호를 어떻게 강화·약화·변화시키는지 서술.',
  '- 반복되는 선호 / 새로 생긴 선호 / 달라진 회피 성향 구분.',
  '- 변화가 작으면: 유지되는 부분 vs 조금씩 강화되는 부분만 짧게 언급.',
  '',
  '[데이터 사용]',
  '- 입력: 기존 취향 정보, 이전 분석, 오늘 시간대별 선택 메뉴.',
  '- 메뉴 이름에서 재료, 맛, 조리법, 음식 유형을 추론해 패턴 설명.',
  '- 자주 선택한 경향을 중심으로 설명하고, 일회성 선택은 과장하지 않음.',
  '',
  '출력 형식: {"analysis": "분석 텍스트"} (JSON, 키 이름 변경 금지)',
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
    `[사용자 선호 정보]`,
    `좋아하는 것: ${likes.length ? likes.join(', ') : '없음'}`,
    `싫어하는 것: ${dislikes.length ? dislikes.join(', ') : '없음'}`,
    '',
    `[기존 취향 분석]`,
    currentAnalysis ? currentAnalysis : '없음 (첫 분석)',
    '',
    `[최근 선택 메뉴]`,
    menuParts.length > 0 ? menuParts.join('\n') : '없음',
    '',
    '[분석 요청]',
    '위 정보(선호 정보, 기존 분석, 시간대별 메뉴)를 모두 종합해 사용자의 음식 취향을 짧게 분석하라.',
    '',
    '분석 기준:',
    '- 기존 취향 정보·이전 분석을 기준선으로 두고, 오늘 선택이 이 기준을 어떻게 강화/약화/변화시키는지 서술.',
    '- 메뉴 이름에서 재료, 맛, 조리법, 스타일을 추론해 공통 특징과 변화된 경향만 요약.',
    '- 아침/점심/저녁/기타 시간대별로 선호가 다른지, 비슷한지 한두 문장 안에서 정리.',
    '',
    '작성 규칙:',
    '- 톤: 차분한 설명체, 과장·칭찬 표현 금지.',
    '- 관찰 가능한 패턴만 서술, 심리 해석·추측 금지.',
  '- 공백 포함 500자 이내에서 핵심만, 같은 내용 반복 금지.',
    '',
    '응답 형식: {"analysis": "분석 텍스트"} (JSON 한 개, 키 이름 고정)',
  ];
  return parts.join('\n');
}

export const PREFERENCE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      // 프롬프트에서 명시한 분량: 공백 포함 500자 이내
      maxLength: 500,
    },
  },
  required: ['analysis'],
  additionalProperties: false,
} as const;
