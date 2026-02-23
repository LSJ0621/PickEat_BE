/**
 * Gemini 통합 Grounding API 호출용 프롬프트 빌더
 *
 * Unified Grounding: Search + Maps Grounding을 1회 API 호출로 통합
 */

// ============================================
// Unified Grounding용 프롬프트
// ============================================

export interface UnifiedGroundingPromptInput {
  menuName: string;
  address: string;
  latitude: number;
  longitude: number;
  language: 'ko' | 'en';
  maxCount?: number;
}

/**
 * Unified Grounding용 프롬프트 생성
 *
 * Search Grounding + Maps Grounding을 동시에 활성화하여
 * 한 번의 API 호출로 맛집 추천과 위치 정보를 함께 조회합니다.
 *
 * @param input.menuName - 검색할 메뉴명
 * @param input.address - 검색 지역 주소
 * @param input.latitude - 검색 중심 위도
 * @param input.longitude - 검색 중심 경도
 * @param input.language - 사용자 언어 설정 ('ko' | 'en')
 * @param input.maxCount - 최대 추천 가게 수 (기본값: 5)
 * @returns 프롬프트 문자열
 */
export function buildUnifiedGroundingPrompt(
  input: UnifiedGroundingPromptInput,
): string {
  const {
    menuName,
    address,
    latitude,
    longitude,
    language,
    maxCount = 5,
  } = input;

  const isKorean = language === 'ko';

  if (isKorean) {
    return `당신은 맛집 추천 전문가입니다.

## 작업
1. Google Search를 통해 "${address}" 근처의 "${menuName}" 맛집을 검색
2. Google Maps에서 각 가게의 정확한 위치 정보 확인
3. **Google Maps에 등록된 가게만** 선별 (최대 ${maxCount}개)
4. 각 가게에 대한 추천 사유 작성

## 검색 위치
- 좌표: ${latitude}, ${longitude}
- 주소: ${address}

## 선별 기준
- **반드시 Google Maps에서 확인된 가게만 포함** (placeId가 있는 가게)
- 리뷰, 평점, 인기도 등을 고려하여 추천 가치가 있는 가게만 선택
- 1km 이내 가게 우선
- 영업 중인 가게 우선

## 출력 필드 설명
- nameKo: 가게명 (한국어)
- nameEn: 가게명 (영어 번역)
- nameLocal: 가게명 (가게 소재국의 현지 언어, Google Maps 등록명). **단, 가게가 한국에 있으면 null, 영어권 국가에 있으면 null**
- addressKo: 주소 (한국어)
- addressEn: 주소 (영어 번역)
- addressLocal: 주소 (가게 소재국의 현지 언어만 사용). **단, 가게가 한국에 있으면 null, 영어권 국가에 있으면 null**
- reason: 추천 이유 (150-200자, 핵심 강점 1-2가지를 간결하게)
- reasonTags: 가게의 핵심 특징 키워드 2-3개 배열
- latitude: 위도 (소수점 6자리)
- longitude: 경도 (소수점 6자리)

## reason 작성 가이드
- 150-200자 내로 작성
- 핵심 강점 1-2가지를 간결하게 작성
- 존댓말 사용
- 구체적인 정보를 기반으로 작성 (추측이나 가정 금지)
- Google Search에서 찾은 실제 정보만 활용

## reasonTags 작성 가이드
- 가게의 핵심 특징을 2-3개 키워드로 요약
- 각 태그는 10자 이내
- 예시: ["시그니처 짬뽕", "매운맛 강추", "재방문 높음"]

## 출력 형식 (JSON)
{"restaurants":[{"nameKo":"교동짬뽕","nameEn":"Gyodong Jjamppong","nameLocal":null,"addressKo":"경기도 남양주시 와부읍 덕소리 474-8","addressEn":"474-8 Deokso-ri, Wabu-eup, Namyangju-si","addressLocal":null,"reason":"해산물이 풍부한 짬뽕이 대표 메뉴로, 얼큰한 국물 맛이 일품이에요.","reasonTags":["시그니처 짬뽕","매운맛 강추","재방문 높음"],"latitude":37.123456,"longitude":127.123456}]}

## 중요
- Google Maps에서 확인되지 않은 가게는 절대 포함하지 마세요
- 추천할 가게가 없으면 빈 배열 반환
- 반드시 JSON 형식으로만 응답
- 응답 직전에 nameKo가 한국어, nameEn이 영어, nameLocal이 현지 언어(한국/영어권이면 null)인지 확인하세요`;
  }

  // English version
  return `You are a restaurant recommendation expert.

## Task
1. Search for "${menuName}" restaurants near "${address}" using Google Search
2. Verify each restaurant's exact location on Google Maps
3. Select only restaurants **registered on Google Maps** (max ${maxCount})
4. Write recommendation reasons for each restaurant

## Search Location
- Coordinates: ${latitude}, ${longitude}
- Address: ${address}

## Selection Criteria
- **Include only restaurants verified on Google Maps** (with placeId)
- Select only restaurants worth recommending based on reviews, ratings, popularity
- Prioritize restaurants within 1km
- Prioritize currently open restaurants

## Output Field Descriptions
- nameKo: Restaurant name (Korean)
- nameEn: Restaurant name (English)
- nameLocal: Restaurant name (local language of the country, as registered on Google Maps). **Set to null if the restaurant is in Korea or an English-speaking country**
- addressKo: Address (Korean)
- addressEn: Address (English)
- addressLocal: Address in PURE local language only. **Set to null if the restaurant is in Korea or an English-speaking country**
- reason: Recommendation reason (150-200 characters, focus on 1-2 key strengths concisely)
- reasonTags: Array of 2-3 keyword tags highlighting key features
- latitude: Latitude (6 decimal places)
- longitude: Longitude (6 decimal places)

## Reason Writing Guide
- Write 150-200 characters
- Focus on 1-2 key strengths concisely
- Use polite language
- Write based on concrete information only (no assumptions)
- Use only actual information found via Google Search

## ReasonTags Writing Guide
- Summarize key features in 2-3 keyword tags
- Each tag should be 10 characters or less
- Example: ["signature jjamppong", "spicy flavor", "high revisit"]

## Output Format (JSON)
{"restaurants":[{"nameKo":"교동짬뽕","nameEn":"Gyodong Jjamppong","nameLocal":null,"addressKo":"경기도 남양주시 와부읍 덕소리 474-8","addressEn":"474-8 Deokso-ri, Wabu-eup, Namyangju-si","addressLocal":null,"reason":"Famous for their spicy seafood noodle soup with rich broth and generous portions.","reasonTags":["signature jjamppong","spicy flavor","high revisit"],"latitude":37.123456,"longitude":127.123456}]}

## Important
- Never include restaurants not verified on Google Maps
- Return empty array if no recommendable restaurants
- Respond only in JSON format
- Before outputting, verify: nameKo is Korean, nameEn is English, nameLocal is the local language (null for Korea/English-speaking countries)`;
}
