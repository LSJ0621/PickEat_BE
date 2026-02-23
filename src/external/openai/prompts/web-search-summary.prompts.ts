/**
 * Web Search Summary Prompts (Call A)
 * 웹 검색을 통해 지역/인구통계 기반 트렌드를 요약하는 프롬프트
 */

/**
 * 시스템 프롬프트 - 한국어
 */
export const WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO = `
당신은 음식 트렌드 정보 요약 전문가입니다.

<critical_rules>
## 정확성 규칙 (절대 준수)
1. 검색 결과에 명확히 존재하는 내용만 요약
2. 추측, 일반화, hallucination 절대 금지
3. 출처가 불분명한 정보는 제외

## 신뢰도 규칙
- 신뢰 가능: 뉴스 기사, 정부/공공 통계, 공식 리뷰 플랫폼
- 제외 대상: 개인 블로그 추측, 광고성 콘텐츠, 출처 불명 주장

## 검색 불충분 시
- confidence: "low" 반환
- 빈 배열 반환 (억지로 채우지 말 것)
</critical_rules>

<focus>
## 조사 초점
음식 종류/카테고리 중심의 트렌드 파악이 목적입니다.
- 지역별 인기 음식 종류 (예: 김치찌개, 삼겹살, 파스타, 마라탕)
- 연령/성별에 따른 선호 음식 카테고리
- 계절별 인기 음식

음식 종류로 응답해주세요 (예: "불고기", "떡볶이", "마라탕").
</focus>

<output_format>
JSON 형식으로만 응답:
{
  "localTrends": ["지역 인기 메뉴 1-3개"],
  "demographicFavorites": ["연령/성별 인기 메뉴 1-3개"],
  "seasonalItems": ["계절 메뉴 0-2개"],
  "confidence": "high|medium|low",
  "summary": "핵심 트렌드 100자 이내"
}
</output_format>
`.trim();

/**
 * 시스템 프롬프트 - 영어
 */
export const WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN = `
You are a food trend information summarization expert.

<critical_rules>
## Accuracy Rules (Strictly Follow)
1. Only summarize content that clearly exists in search results
2. No speculation, generalization, or hallucination
3. Exclude information with unclear sources

## Reliability Rules
- Trusted sources: News articles, government/public statistics, official review platforms
- Exclude: Personal blog speculation, promotional content, unverified claims

## When Search is Insufficient
- Return confidence: "low"
- Return empty arrays (do not force-fill)
</critical_rules>

<focus>
## Research Focus
The goal is to identify food category/type trends.
- Popular food types by region (e.g., kimchi stew, grilled pork, pasta, malatang)
- Food preferences by age/gender
- Seasonal popular foods

Respond with food type names in English only (e.g., "bulgogi", "tteokbokki", "kimchi stew"). No non-English characters.
</focus>

<output_format>
Respond only in JSON format:
{
  "localTrends": ["1-3 popular local menus"],
  "demographicFavorites": ["1-3 popular menus by age/gender"],
  "seasonalItems": ["0-2 seasonal menus"],
  "confidence": "high|medium|low",
  "summary": "Key trends in 100 characters or less"
}
</output_format>
`.trim();

/**
 * 언어에 따른 시스템 프롬프트 반환
 */
export function getWebSearchSummarySystemPrompt(
  language: 'ko' | 'en' = 'ko',
): string {
  return language === 'en'
    ? WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_EN
    : WEB_SEARCH_SUMMARY_SYSTEM_PROMPT_KO;
}

/**
 * 웹 검색 요약용 사용자 프롬프트 생성
 * @param address - 사용자 주소
 * @param ageGroup - 연령대 (예: "30대", "30s")
 * @param gender - 성별 (예: "남성", "Male")
 * @param language - 언어 코드
 * @returns 웹 검색 쿼리용 프롬프트
 */
export function buildWebSearchSummaryPrompt(
  address?: string,
  ageGroup?: string,
  gender?: string,
  language: 'ko' | 'en' = 'ko',
): string {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const season = getSeason(currentMonth, language);

  const parts: string[] = [];

  if (language === 'ko') {
    parts.push(`현재: ${currentYear}년 ${currentMonth}월 (${season})`);

    if (address) {
      // 주소에서 지역 추출 (예: "서울특별시 강남구 ..." → "서울 강남")
      const region = extractRegionFromAddress(address);
      parts.push(`지역: ${region}`);
    }

    if (ageGroup) {
      parts.push(`연령대: ${ageGroup}`);
    }

    if (gender) {
      parts.push(`성별: ${gender}`);
    }

    parts.push('');
    parts.push(
      '위 조건에 맞는 인기 음식 트렌드를 웹에서 검색하고 요약해주세요.',
    );
    parts.push('검색 쿼리 예시:');

    if (address && ageGroup && gender) {
      const region = extractRegionFromAddress(address);
      parts.push(
        `- "${region} ${ageGroup} ${gender} 인기 음식 ${currentYear}"`,
      );
    } else if (address) {
      const region = extractRegionFromAddress(address);
      parts.push(`- "${region} 인기 맛집 ${currentYear}"`);
    }

    if (season) {
      parts.push(`- "${season} 인기 음식 ${currentYear}"`);
    }
  } else {
    parts.push(`Current: ${currentMonth}/${currentYear} (${season})`);

    if (address) {
      const region = extractRegionFromAddress(address);
      parts.push(`Region: ${region}`);
    }

    if (ageGroup) {
      parts.push(`Age Group: ${ageGroup}`);
    }

    if (gender) {
      parts.push(`Gender: ${gender}`);
    }

    parts.push('');
    parts.push(
      'Search the web for popular food trends matching the above criteria and summarize.',
    );
    parts.push('Example search queries:');

    if (address && ageGroup && gender) {
      const region = extractRegionFromAddress(address);
      parts.push(
        `- "${region} ${ageGroup} ${gender} popular food ${currentYear}"`,
      );
    } else if (address) {
      const region = extractRegionFromAddress(address);
      parts.push(`- "${region} popular restaurants ${currentYear}"`);
    }

    if (season) {
      parts.push(`- "${season} food trends ${currentYear}"`);
    }
  }

  return parts.join('\n');
}

/**
 * 주소에서 지역 추출
 */
function extractRegionFromAddress(address: string): string {
  // 한국 주소 패턴
  const koreaMatch = address.match(
    /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)\s*([^\s]+)?/,
  );

  if (koreaMatch) {
    const city = koreaMatch[1]
      .replace('특별시', '')
      .replace('광역시', '')
      .replace('특별자치시', '')
      .replace('도', '');
    const district = koreaMatch[2] || '';
    return district ? `${city} ${district}` : city;
  }

  // 간단한 주소 (예: "서울 강남구")
  const simpleMatch = address.match(
    /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*([^\s]+)?/,
  );

  if (simpleMatch) {
    return simpleMatch[2]
      ? `${simpleMatch[1]} ${simpleMatch[2]}`
      : simpleMatch[1];
  }

  // 영문 주소 - 첫 두 단어 추출
  const words = address.split(/[,\s]+/).filter((w) => w.length > 0);
  if (words.length >= 2) {
    return `${words[0]} ${words[1]}`;
  }

  return words[0] || address;
}

/**
 * 현재 월에 해당하는 계절 반환
 */
function getSeason(month: number, language: 'ko' | 'en'): string {
  if (language === 'ko') {
    if (month >= 3 && month <= 5) return '봄';
    if (month >= 6 && month <= 8) return '여름';
    if (month >= 9 && month <= 11) return '가을';
    return '겨울';
  } else {
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Fall';
    return 'Winter';
  }
}
