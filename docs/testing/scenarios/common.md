# 공통 인프라 (Common) 테스트 시나리오

## Backend Unit 테스트 — Guard / Pipe

### JwtGuard
- [x] 유효한 토큰 → 통과 (canActivate true)
- [x] 만료된 토큰 → 401 UnauthorizedException
- [x] 토큰 없음 → 401 UnauthorizedException
- [x] 잘못된 형식 토큰 → 401 UnauthorizedException

### RolesGuard
- [x] ADMIN 역할 필요 + ADMIN 사용자 → 통과
- [x] ADMIN 역할 필요 + USER 사용자 → 403 ForbiddenException (AUTH_INSUFFICIENT_PERMISSIONS)
- [x] 역할 필요 + 유저 정보 없음 → 403 ForbiddenException (AUTH_ROLE_NOT_FOUND)
- [x] 역할 미설정 엔드포인트 → 모든 사용자 통과
- [x] superAdminOnly + SUPER_ADMIN → 통과
- [x] superAdminOnly + ADMIN → 403 ForbiddenException (ADMIN_SUPER_ADMIN_REQUIRED)
- [x] superAdminOnly + 유저 없음 → 403 ForbiddenException (AUTH_ROLE_NOT_FOUND)

### FileValidationPipe
- [x] 허용 확장자 (jpg, png, webp) → 통과
- [x] 비허용 확장자 (exe, sh) → 400
- [x] 파일 크기 초과 → 400
- [x] 파일 없음 → 적절한 처리

---

## Backend Unit 테스트 — 외부 API Client

### 외부 API 응답 파싱 (fixture 기반)

- [x] GeminiClient — 마크다운 코드블록 정상 JSON 응답 파싱 (restaurants + placeId)
- [x] GeminiClient — 잘린 JSON 복구 후 파싱
- [x] GeminiClient — API 에러 응답 → 적절한 예외
- [x] GooglePlacesClient — Autocomplete 응답 파싱 (제안 목록)
- [x] GooglePlacesClient — Details 응답 파싱 (상세 정보)
- [x] GooglePlacesClient — 빈 결과 처리 (빈 배열)
- [x] GoogleSearchClient — CSE 블로그 검색 결과 파싱 (BlogSearchResult[])
- [x] GoogleSearchClient — 빈 결과 처리 (items 없음 → 빈 배열)
- [x] OpenAiBatchClient — 성공 JSONL 결과 파싱 (results Map)
- [x] OpenAiBatchClient — 부분 실패 결과 처리 (results + errors 분리)

### 외부 API 장애 시나리오
- [x] API 타임아웃 → ExternalApiException 발생
- [x] 429 Rate Limit → 지수 백오프 재시도 확인
- [x] 500 서버 에러 → 재시도 후 실패 → 에러 로깅
- [x] 잘못된 응답 형태 → 파싱 실패 → 에러 throw (앱 죽지 않음)

### OpenAiBatchClient — 장애 + 추가 파싱
- [x] createBatch — 정상 → batchId (string) 반환 (NOT submitBatch)
- [ ] createBatch — 429 Rate Limit → 지수 백오프 재시도 확인
- [x] createBatch — 500 서버 에러 → 재시도 후 ExternalApiException
- [x] getBatchStatus — 인증 만료(401) → ExternalApiException 전파 (NOT retrieveBatch)
- [x] getBatchStatus — 정상 응답 → { status, progress, outputFileId, errorFileId } 파싱
- [x] uploadBatchContent — 정상 → fileId 반환
- [ ] createBatchContent — BatchRequest[] → JSONL 문자열 직렬화
- [ ] downloadResults — 타임아웃 → ExternalApiException
- [x] downloadResults — JSONL 한 줄 파싱 실패 → 해당 줄만 errors에 기록
- [x] downloadErrors — 정상 → BatchError[] 반환
- [x] cancelBatch — 정상 → 예외 없음
- [ ] isReady — API 키 미설정 → false

### GoogleOAuthClient
- [ ] getUserProfile — fixture 정상 응답 파싱 (id, email, name, picture) (NOT fetchProfile)
- [ ] getUserProfile — 401 Unauthorized → ExternalApiException
- [ ] getUserProfile — 500 서버 에러 → 재시도 후 실패
- [ ] getUserProfile — 응답에 email 필드 없음 → 파싱 실패 예외
- [ ] getAccessToken — 잘못된 code → ExternalApiException (NOT exchangeCode)
- [ ] getAccessToken — 정상 code → GoogleOAuthTokenResponse 반환
- [ ] getAccessToken — 테스트 코드 입력 → handleTestCode 경로로 테스트 응답 반환

### KakaoOAuthClient
- [ ] getUserProfile — fixture 정상 응답 파싱 (id, kakao_account.email, profile.nickname)
- [ ] getUserProfile — 401 Unauthorized → ExternalApiException
- [ ] getUserProfile — email 동의 안 함 (kakao_account.email 없음) → 적절한 예외
- [ ] getUserProfile — 타임아웃 → ExternalApiException
- [ ] getAccessToken — 잘못된 code → ExternalApiException
- [ ] getAccessToken — 테스트 코드 입력 → handleTestCode 경로로 테스트 응답 반환

### GeminiClient — 장애 + 추가
- [ ] searchRestaurantsUnified — 정상 응답 → restaurants + placeId 파싱 (NOT generate)
- [ ] searchRestaurantsUnified — 타임아웃 → ExternalApiException
- [ ] searchRestaurantsUnified — 429 Rate Limit → 지수 백오프 재시도
- [ ] searchRestaurantsUnified — 응답 finishReason=MAX_TOKENS → recoverTruncatedJson 복구 후 파싱
- [ ] searchRestaurantsUnified — safety block 응답 → 적절한 예외 매핑
- [ ] searchRestaurantsUnified — 빈 candidates → ExternalApiException
- [ ] searchRestaurantsUnified — isEnabled()=false (API 키 없음) → 비활성화 분기 처리

### S3Client
- [ ] uploadBugReportImage — 정상 업로드 → S3 URL 반환
- [ ] uploadBugReportImage — AWS SDK 에러(AccessDenied) → ExternalApiException
- [ ] uploadBugReportImage — 허용되지 않는 확장자 (extractSafeFileExtension 실패) → 적절한 예외
- [ ] uploadUserPlaceImage — 정상 업로드 → S3 URL 반환
- [ ] uploadUserPlaceImage — AWS SDK 에러 → ExternalApiException
- [ ] uploadUserPlaceImage — 허용되지 않는 확장자 → 적절한 예외
- [ ] getBucketStats — 정상 → 객체 수/총 용량 등 통계 반환
- [ ] getBucketStats — SDK 에러 → ExternalApiException

---

## Backend Unit 테스트 — 비즈니스 서비스 (추가)

### UserTasteAnalysisService
- [ ] upsert — 기존 레코드 없음 → 신규 생성 + analysisVersion=1
- [ ] upsert — 기존 레코드와 데이터 동일 → 저장 없이 기존 레코드 그대로 반환
- [ ] upsert — 기존 레코드와 compactSummary 다름 → 저장 + analysisVersion 증가
- [ ] upsert — stablePatterns만 다름 → 저장 + analysisVersion 증가
- [ ] upsert — lastAnalyzedAt 미지정 → 현재 시각으로 설정
- [ ] bulkUpsert — 빈 배열 → DB 호출 없음
- [ ] bulkUpsert — 다수 항목 → 단일 upsert 호출로 배치 처리
- [ ] bulkUpsert — data 필드 누락 시 null 처리 (stablePatterns ?? null 등)

### PreferenceUpdateAiService
- [ ] generatePreferenceAnalysis — 정상 응답 → analysis trim 후 반환
- [ ] generatePreferenceAnalysis — OpenAI 미초기화(API 키 없음) → ExternalApiException
- [ ] generatePreferenceAnalysis — response.choices[0].message.content 없음 → OpenAIResponseException
- [ ] generatePreferenceAnalysis — content가 JSON 형식 아님 → OpenAIResponseException
- [ ] generatePreferenceAnalysis — parsed.analysis 타입이 string 아님 → OpenAIResponseException
- [ ] generatePreferenceAnalysis — parsed.analysis 빈 문자열 → OpenAIResponseException
- [ ] generatePreferenceAnalysis — OpenAI API 실패(429/500) → 지수 백오프 후 ExternalApiException
- [ ] generatePreferenceAnalysis — preferredLanguage='en' 입력 → 결과 스키마가 en 언어 반영 (private mapPreferredLanguage 간접 검증)
- [ ] generatePreferenceAnalysis — preferredLanguage='ko'/기타 입력 → 결과가 ko 스키마 반영
- [ ] generatePreferenceAnalysis — preferredLanguage undefined → 기본값 ko 경로로 동작
