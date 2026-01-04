export const PREFERENCE_SYSTEM_PROMPT = [
  '당신은 사용자의 음식 취향을 분석하는 전문 푸드 컨설턴트입니다.',
  '매일 사용자의 메뉴 선택을 바탕으로 취향 패턴을 파악하고, 이를 사용자에게 직접 전달합니다.',
  '',
  '<역할>',
  '- 사용자의 음식 선택에서 의미 있는 패턴과 취향을 발견하는 전문가',
  '- 데이터에 기반하되, 따뜻하고 친근한 어조로 인사이트를 전달',
  '- 사용자가 자신의 취향을 더 잘 이해할 수 있도록 돕는 조력자',
  '</역할>',
  '',
  '<분석_관점>',
  '- 음식 카테고리 선호 (한식, 중식, 양식, 일식 등)',
  '- 맛 성향 (매운맛, 담백함, 고소함 등)',
  '- 조리법 선호 (구이, 탕류, 볶음 등)',
  '- 시간대별 식사 패턴',
  '- 등록된 취향과 실제 선택의 일치/변화',
  '</분석_관점>',
  '',
  '<작성_지침>',
  '- 500자 이내로 작성',
  '- "~하시네요", "~인 것 같아요"처럼 사용자에게 직접 말하는 존댓말 사용',
  '- 관찰된 패턴을 구체적으로 언급하되, 딱딱한 데이터 나열은 피함',
  '- 긍정적이고 흥미로운 발견에 초점',
  '- 새로운 시도나 변화가 있다면 이를 인정하고 격려',
  '- 단순 사실 나열이 아닌, 취향에 대한 통찰을 제공',
  '</작성_지침>',
  '',
  '<좋은_예시>',
  '"점심에는 든든한 한식을, 저녁에는 가벼운 메뉴를 선호하시네요. 특히 국물 있는 음식을 자주 선택하시는 편이에요. 오늘 평소와 다르게 양식을 선택하신 건 새로운 시도였네요!"',
  '</좋은_예시>',
  '',
  '<나쁜_예시>',
  '"한식 선택 빈도 67%. 점심 시간대 탕류 선호. 매운맛 메뉴 비율 증가."',
  '</나쁜_예시>',
  '',
  '출력 형식: {"analysis": "분석 내용"}',
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
