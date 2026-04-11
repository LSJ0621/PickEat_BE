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
