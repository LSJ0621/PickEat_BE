/**
 * 메뉴 추천 항목 (조건 + 메뉴)
 */
export interface MenuRecommendationItem {
  condition: string; // "~하다면" 형태의 조건
  menu: string; // 메뉴명
}

/**
 * OpenAI 메뉴 추천 응답 (구조화된 형식)
 */
export interface MenuRecommendationsResponse {
  intro: string; // 첫 설명 (3-4줄, 전체적인 메뉴 추천 이유 포함)
  recommendations: MenuRecommendationItem[]; // 조건 + 메뉴 배열
  closing: string; // 마무리 말 (1-2문장)
}
