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
- name: 가게명 (한국어) - UI 표시에 사용
- localizedName: 가게명 (현지 언어, Google Maps 등록명) - 블로그 검색에 사용
- address: 주소 (한국어) - UI 표시에 사용
- localizedAddress: 주소 (현지 언어, 입력된 주소의 국가 언어로 작성) - 블로그 검색에 사용
- reason: 이 가게를 추천하는 상세한 이유 (한국어, 300-500자)
- latitude: 위도 (소수점 6자리)
- longitude: 경도 (소수점 6자리)

## reason 작성 가이드
- 최소 300자 이상 작성 (필수)
- 구조: [대표 메뉴 소개] → [가게 특징/유명한 이유] → [방문 추천 이유]
- 포함해야 할 내용:
  1. 시그니처 메뉴 또는 인기 메뉴 (맛, 조리법, 재료 특징)
  2. 가게가 유명한 이유 (리뷰에서 자주 언급되는 포인트, 평점, 미디어 노출 등)
  3. 가게 분위기, 서비스 특징, 가격대 정보
  4. 이 가게를 방문해야 하는 종합적인 이유
- 존댓말 사용
- 구체적인 정보를 기반으로 작성 (추측이나 가정 금지)
- Google Search에서 찾은 실제 정보만 활용

## 출력 형식 (JSON)
{"restaurants":[{"name":"교동짬뽕","localizedName":"교동짬뽕","address":"경기도 남양주시 와부읍 덕소리 474-8","localizedAddress":"경기도 남양주시 와부읍 덕소리 474-8","reason":"추천 이유","latitude":37.123456,"longitude":127.123456}]}

## 중요
- Google Maps에서 확인되지 않은 가게는 절대 포함하지 마세요
- 추천할 가게가 없으면 빈 배열 반환
- 반드시 JSON 형식으로만 응답`;
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
- name: Restaurant name (English) - used for UI display
- localizedName: Restaurant name (local language, as registered on Google Maps) - used for blog search
- address: Address (English) - used for UI display
- localizedAddress: Address (local language, in the official language of the input address's country) - used for blog search
- reason: Detailed reason for recommending (English, 300-500 characters)
- latitude: Latitude (6 decimal places)
- longitude: Longitude (6 decimal places)

## Reason Writing Guide
- Write at least 300 characters (required)
- Structure: [Signature menu] → [Restaurant features/popularity] → [Visit recommendation]
- Include:
  1. Signature or popular menu items (taste, cooking method, ingredient features)
  2. Why the restaurant is famous (common review points, ratings, media coverage)
  3. Atmosphere, service features, price range
  4. Comprehensive reason to visit
- Use polite language
- Write based on concrete information only (no assumptions)
- Use only actual information found via Google Search

## Output Format (JSON)
{"restaurants":[{"name":"local name","localizedName":"English name","address":"local address","localizedAddress":"English address","reason":"recommendation reason","latitude":37.123456,"longitude":127.123456}]}

## Important
- Never include restaurants not verified on Google Maps
- Return empty array if no recommendable restaurants
- Respond only in JSON format`;
}
