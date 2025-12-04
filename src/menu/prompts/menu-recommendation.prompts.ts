/**
 * 메뉴 추천을 위한 프롬프트 템플릿
 */
export const SYSTEM_PROMPT = [
  '역할: Pick-Eat 앱의 음식 메뉴 추천 어시스턴트.',
  '목표: 사용자 요청(현재 상황·기분·제약)을 최우선으로, 저장된 취향 정보와 취향 분석을 함께 고려해 한국에서 통용되는 표준 메뉴명을 추천.',
  '',
  '규칙:',
  '- 응답은 JSON `recommendations` 문자열 배열만 포함하며, 각 원소는 형용사 없이 하나의 실제 메뉴 이름만 담는다. (중복·합성 메뉴, 영어/괄호/추가 설명 금지)',
  '- 사용자가 입력한 요청을 우선 반영하되, 취향 정보·취향 분석을 바탕으로 평소 잘 맞는 메뉴를 고려하고, 최근 경향과 오늘 맥락을 반영해 취향과 조금 다른 메뉴도 1개 정도 함께 섞어 1~5개를 추천한다.',
  '- 충분히 고민하되, 과도한 지연 없이 빠르게 최종 JSON만 응답한다.',
].join('\n');

/**
 * User 프롬프트 생성 함수
 * @param userPrompt 사용자가 입력한 요청
 * @param likes 사용자가 좋아하는 것 (태그 배열)
 * @param dislikes 사용자가 싫어하는 것 (태그 배열)
 * @param analysis 사용자 취향 분석 텍스트 (200자 이내)
 * @returns 완성된 User 프롬프트
 */
export function buildUserPrompt(
  userPrompt: string,
  likes: string[],
  dislikes: string[],
  analysis?: string,
): string {
  const normalizedLikes = likes?.filter(Boolean) ?? [];
  const normalizedDislikes = dislikes?.filter(Boolean) ?? [];
  const hasLikes = normalizedLikes.length > 0;
  const hasDislikes = normalizedDislikes.length > 0;
  const hasAnalysis = analysis && analysis.trim().length > 0;

  const preferenceParts: string[] = [];
  if (hasLikes) {
    preferenceParts.push(`좋아하는 것: ${normalizedLikes.join(', ')}`);
  }
  if (hasDislikes) {
    preferenceParts.push(`싫어하는 것: ${normalizedDislikes.join(', ')}`);
  }
  if (hasAnalysis) {
    preferenceParts.push(`취향 분석: ${analysis.trim()}`);
  }

  return [
    `사용자 요청: ${userPrompt}`,
    preferenceParts.length > 0
      ? `참고할 취향 정보: ${preferenceParts.join(' | ')}`
      : '참고할 취향 정보: 없음',
  ].join('\n');
}

export const MENU_RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[가-힣]+$',
      },
      minItems: 1,
      maxItems: 5,
      description:
        '맥락에 맞는 메뉴 응답. 사용자 요청의 맥락에 따라 하나 또는 여러 개의 메뉴를 반환 (표준 메뉴명만 사용)',
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const;
