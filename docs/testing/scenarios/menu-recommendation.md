# 메뉴 추천 (Menu Recommendation) 테스트 시나리오

## Backend API 테스트

### 메뉴 추천 (POST /menu/recommend)
- [x] 정상 추천 요청 (prompt) → 201 + 추천 결과
- [x] prompt 누락 → 400
- [x] prompt 2000자 초과 → 400
- [x] 인증 없이 요청 → 401
- [x] 기본 주소 미설정 사용자 → 400 (MENU_DEFAULT_ADDRESS_REQUIRED)

### 메뉴 추천 SSE 스트리밍 (POST /menu/recommend/stream)
- [x] 정상 요청 → SSE 이벤트 스트림 (status → result → end)
- [x] prompt 누락 → 400
- [x] 인증 없이 요청 → 401

### 메뉴 선택 저장 (POST /menu/selections)
- [x] 정상 저장 (menus 배열 + slot) → 201
- [x] 빈 menus 배열 → 400
- [x] 잘못된 slot 값 → 400
- [x] 인증 없이 요청 → 401

### 메뉴 선택 - 같은 날 merge (POST /menu/selections - merge)
- [x] 같은 날 메뉴를 2번 선택하면 기존 선택에 merge된다

### 메뉴 선택 수정 (PATCH /menu/selections/:id)
- [x] 정상 수정 → 200 + `{ selection }` wrapper
- [x] 존재하지 않는 id → 400 (서비스가 userId+selectionId 동시 조회, 미발견 시 BadRequest)
- [x] 다른 사용자의 선택 수정 시도 → 400 (동일 이유)
- [x] 특정 slot만 업데이트하면 해당 slot만 변경된다
- [x] cancel=true로 수정하면 menuPayload가 빈 배열이 된다

### 메뉴 선택 이력 (GET /menu/selections/history)
- [x] 정상 조회 (date 쿼리) → 200
- [x] 인증 없이 요청 → 401

### 추천 히스토리 (GET /menu/recommendations/history)
- [x] 정상 조회 (page, limit) → 200 + 페이지네이션 (items, pageInfo)
- [x] date 필터 적용 → 해당 날짜만 반환
- [x] 빈 결과 → 200 + 빈 배열

### 추천 상세 조회 (GET /menu/recommendations/:id)
- [x] 정상 조회 → 200 + `{ history: { id, recommendations, ... }, places }` wrapper
- [x] 존재하지 않는 id → 400 (서비스가 userId+id 동시 조회, 미발견 시 BadRequest)
- [x] 다른 사용자의 추천 조회 → 400 (동일 이유)

### 맛집 추천 — Gemini (GET /menu/recommend/places/v2)
- [x] 정상 요청 (menuName, address, lat, lng, menuRecommendationId) → 200
- [x] 필수 필드 누락 → 400
- [x] 인증 없이 요청 → 401

### 맛집 추천 — 검색 기반 (GET /menu/recommend/places/search)
- [x] 정상 요청 → 200 + 추천 목록
- [x] 필수 필드 누락 → 400
- [x] 인증 없이 요청 → 401

### 맛집 추천 — 검색 기반 SSE (GET /menu/recommend/places/search/stream)
- [x] 정상 요청 → SSE 이벤트 스트림
- [x] 인증 없이 요청 → 401

### 맛집 추천 — 커뮤니티 (GET /menu/recommend/places/community)
- [x] 정상 요청 → 200 + 커뮤니티 등록 가게 추천
- [x] 인증 없이 요청 → 401

### 맛집 추천 — 커뮤니티 SSE (GET /menu/recommend/places/community/stream)
- [x] 정상 요청 → SSE 이벤트 스트림
- [x] 인증 없이 요청 → 401

### 가게 상세 (GET /menu/places/:placeId/detail)
- [x] 정상 조회 → 200 + 장소 상세 정보
- [x] mock 환경에서 임의의 placeId도 200 반환 (mock이 항상 데이터 반환)

### 블로그 검색 (GET /menu/restaurant/blogs)
- [x] 정상 검색 (query, restaurantName) → 200 + 검색 결과
- [x] query 누락 → 400

---

## Backend Unit 테스트

### MenuRecommendationService
- [x] recommend — 기본 주소 있는 사용자 → 추천 결과 저장 + 반환
- [ ] recommend — 사용자 선호도 반영 확인 (likes/dislikes가 프롬프트에 포함) <!-- 행동 테스트 원칙 §6.1 위반(mock.calls 인자만 검증)으로 제거 -->
- [x] recommend — 기본 주소 없는 사용자 → 에러
- [x] recommend — tasteAnalysis 조회 실패해도 추천은 계속 진행
- [x] getHistory — 페이지네이션 동작 (page, limit, totalCount, hasNext)
- [x] getHistory — date 필터 적용
- [x] findById — 본인 추천만 조회 가능

### GeminiPlacesService
- [x] recommendRestaurants — 정상 응답에서 추천 목록 + placeId + metadata 추출
- [x] recommendRestaurants — 응답에 placeId 누락 시 이름 기반 매칭 (searchName, searchAddress 설정)

### PreferenceBatchScheduler
- [x] advisory lock 획득 성공 → 배치 제출 진행
- [x] advisory lock 획득 실패 → 스킵 (다른 인스턴스가 실행 중)
- [x] 에러 발생 시 alertFailure 호출 (Discord 알림)
- [x] 배치 실패 시 재시도 로직

### MenuRecommendationService — 추가 분기
- [ ] recommend — Gemini 응답 JSON이 잘린 경우 → 복구 후 파싱 성공
- [ ] recommend — placeId 미존재 → nameLocal/nameKo/nameEn 순서로 매칭하여 searchName/searchAddress 설정
- [ ] recommend — Gemini 응답 빈 배열 → 빈 추천 결과로 예외 없이 저장
- [ ] recommend — tasteAnalysis 조회 중 예외 → 기본 선호도만으로 프롬프트 구성하여 추천 계속

### PlaceService
- [ ] searchRestaurantsWithGooglePlaces — 정상 쿼리 → GooglePlacesClient 호출 후 맛집 목록 반환
- [ ] searchRestaurantsWithGooglePlaces — 빈 결과 → 빈 배열 (예외 없음)
- [ ] searchRestaurantsWithGooglePlaces — 외부 API 타임아웃 → ExternalApiException 전파
- [ ] getPlaceDetail — 언어 기본값 'ko' → GooglePlacesClient detail 호출 (ko 파라미터)
- [ ] getPlaceDetail — 언어 'en' 지정 → en 파라미터로 호출
- [ ] searchRestaurantBlogs — (query, restaurantName) 정상 → GoogleSearchClient 호출 후 BlogSearchResult[] 반환
- [ ] recommendRestaurants — validateRecommendInput 실패 → BadRequestException
- [ ] recommendRestaurants — validateNoExistingRecommendation 실패 (중복 추천 존재) → 예외
- [ ] recommendRestaurants — 정상 플로우 → PlaceRecommendation 저장 후 반환
- [ ] buildRecommendationDetailResponse — PlaceRecommendation 존재 → 상세 응답 구성
- [ ] buildRecommendationDetailResponse — place 미존재 → buildDbFallbackPlaceResponse 경로로 fallback 응답 구성

### Utils — place-id.util
- [x] normalizePlaceId — "places/..." 프리픽스 제거
- [x] normalizePlaceId — 프리픽스 없음 → 그대로 반환
- [x] parseUserPlaceId — "user_place_123" → 123 반환
- [x] parseUserPlaceId — prefix 없음 → null
- [x] parseUserPlaceId — prefix 뒤가 숫자 아님 → null

### Gpt4oMiniValidationService
- [ ] validate — 정상 응답 → { valid: true, reasons: [] }
- [ ] validate — 잘못된 JSON 응답 → OpenAIResponseException
- [ ] validate — 빈 배열 응답 → valid=false + 사유 포함
- [ ] validate — 일부 항목만 invalid → invalid 항목 목록 반환
- [ ] validate — OpenAI 타임아웃 → ExternalApiException
- [ ] validate — max_tokens 초과로 응답 잘림 → OpenAIResponseException

### WebSearchSummaryService
- [ ] summarize — 정상 웹검색 응답 → 요약 + 출처 목록 반환
- [ ] summarize — 검색 결과 없음 → 빈 요약/기본 메시지 분기
- [ ] summarize — GPT 응답 content 없음 → OpenAIResponseException
- [ ] summarize — 응답 파싱 실패(JSON 형식 아님) → OpenAIResponseException
- [ ] summarize — 외부 API 429 → 지수 백오프 후 재시도 결과
- [ ] summarize — 외부 API 500 → 재시도 후 실패 → ExternalApiException
