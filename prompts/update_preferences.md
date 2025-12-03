# 코드 기반 기능 구현 계획: 메뉴 선택 저장 + 자정 LLM 취향 갱신

## 현황 요약
- 취향 정보는 `src/user/entities/{user,social-login}.entity.ts`의 `preferences` JSONB(`likes/dislikes`)에 저장되고, `src/user/user.controller.ts`의 `GET/POST /user/preferences`로 조회/수정된다.
- 메뉴 추천 시 `src/menu/menu.service.ts`가 `user.preferences`를 읽어 OpenAI(`BaseMenuService`)에 전달하고 추천 이력은 `MenuRecommendation`(문자열 배열)으로만 보관된다. 실제로 사용자가 고른 메뉴를 저장하는 로직은 없다.
- 스케줄러나 큐 의존성(`@nestjs/schedule`, Bull 등)은 현재 없음.

## 목표
- AI가 제안한 메뉴 중 사용자가 선택한 메뉴를 저장한다.
- 매일 자정(00:00)에 선택 이력을 LLM에 전달해 `likes/dislikes` 취향을 자동 갱신한다.

## 데이터 모델 (엔티티)
`MenuSelection` (`src/menu/entities/menu-selection.entity.ts`)
- 기본 필드
  - `id: number` PK
  - `menuName: string` (trim 후 저장)
  - `selectedAt: Date`(기본값 now)
  - `status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'` (기본값 `PENDING`)
  - `lastTriedAt: Date | null` (마지막 처리 시각)
  - `retryCount: number` (기본값 0)
- 관계
  - `user: User | null` (FK, onDelete CASCADE)
  - `socialLogin: SocialLogin | null` (FK, onDelete CASCADE)
  - `menuRecommendation: MenuRecommendation | null` (FK, onDelete SET NULL) — 추천 히스토리와 연결

## API/서비스 설계
`POST /menu/selections` (MenuController)
- DTO `CreateMenuSelectionDto`
  - `menuName: string` (필수)
  - `historyId?: number` (선택: 기존 추천 이력 id, 소유권 체크)
- 흐름
  1. `userService.findUserOrSocialLoginByEmail`로 인증 주체 확인.
  2. `historyId`가 있으면 해당 `MenuRecommendation`이 본인 소유인지 검증 후 연결.
  3. `MenuService.createSelection`에서 `menuName` 정규화(트림, 빈값 거르기), 엔티티 저장.
  4. 응답: 생성된 selection id와 저장된 필드 반환(간단 요약).

## LLM 취향 갱신 파이프라인
- 프롬프트 템플릿(`src/user/prompts/preference-update.prompts.ts`)
  - 입력: `currentPreferences`(likes/dislikes), `recentSelections`(메뉴명 배열 + 빈도), 필요 시 주소/위치 맥락.
  - 출력: `{ likes: string[]; dislikes: string[] }` 스키마 명시, 최대 길이/중복 제거 요구.
- LLM 클라이언트(`PreferenceUpdateAiService`)
  - OpenAI 패턴 재사용, 응답 파싱 후 `UserService.updatePreferences` / `updateSocialLoginPreferences` 호출.
  - 실패 시 기존 값 유지, 에러 로그.

## 스케줄링/배치
- 의존성: `@nestjs/schedule` 추가, `ScheduleModule.forRoot()` 등록.
- `PreferencesScheduler`(`src/user/preferences.scheduler.ts`)에 `@Cron('0 0 * * *')`.
  - 조회 대상: `MenuSelection` 중 `status='PENDING'`인 건.
  - 처리 단계:
    1. 상태를 `IN_PROGRESS`, `lastTriedAt=now()`로 갱신(동시성 방지: 잠금 또는 `UPDATE ... WHERE status IN (...)`).
    2. 사용자 단위 집계 → LLM 호출 → 취향 업데이트.
    3. 성공 시 대상 selection들을 `SUCCEEDED`, `retryCount` 유지(또는 리셋).
    4. 실패 시 `FAILED`, `retryCount++`만 기록.
  - 추가 스케줄러: 매일 09:00 크론에서 `FAILED` 건을 일괄 `PENDING`으로 되돌려 재시도(백오프 시각 필드 없음, 고정 시간 재시도).
  - 배치 크기/타임아웃/재시도 로깅 포함(에러 메시지는 저장하지 않음).

## 추천 이력 소유권을 왜 검증하나?
- 이유: 임의의 `historyId`에 선택을 붙이면 다른 사용자의 추천 이력에 오염된 선택 기록이 쌓여 취향 업데이트/통계가 망가질 수 있음.
- 만약 검증이 번거롭다면:
  - 선택: `historyId` 필드 자체를 받지 않는다(선택 기록은 추천 이력과 독립 저장).
  - 또는 `historyId` 없이 `menuName`만 저장해도 취향 갱신 목적은 충족된다.
  - 필드를 유지한다면 반드시 “해당 추천이 현재 로그인 사용자의 것인지”를 확인하는 단계가 필요하다.

## 로깅/보안
- 선택 저장/LLM 호출/취향 업데이트 성공·실패를 `Logger`로 남기되 메뉴명 외 PII는 최소화.
- LLM 요청/응답 샘플 로깅 시 민감 정보 제거, 오류 시에도 preference 값 노출 최소화.

## 테스트 전략
- 단위: `CreateMenuSelectionDto` 검증, `MenuService.createSelection`(소유권/정규화), `PreferenceUpdateAiService` 응답 파싱, `UserService.updatePreferences` 병합.
- e2e: `POST /menu/selections` → 크론 실행(Mock LLM) → `GET /user/preferences`로 갱신 확인 흐름.
- 부하/회귀: 선택 건수 증가 시 크론 쿼리/그룹핑 성능 확인. 

## 메뉴 이름 JSONB 일자별 저장 계획 (두 컬럼 유지)
- 요구: `MenuSelection`에 시간·날짜 모두 유지하며 메뉴를 JSONB로 저장.
- 스키마 변경
  - `menuName text` → `menuPayload jsonb` (예: `{ "name": "비빔밥" }`)
  - `selectedAt timestamptz`(기존 유지, 정렬/추적용)
  - `selectedDate date` 추가 (`selectedAt`의 날짜 부분, 날짜 필터/인덱스용)
- 저장 로직
  1) `createSelection` 시 `menuPayload = { name: normalizedMenuName }` 저장.
  2) `selectedDate = selectedAt`의 날짜 부분 세팅.
- 조회/집계/LLM
  - 날짜 필터/집계: `WHERE selectedDate = :date` 사용.
  - 시간 정렬/로그: `selectedAt` 사용.
  - LLM 입력: `menuPayload.name` 추출.
- 프론트 영향: 요청/응답은 기존 `menuName` 그대로 유지, 내부 저장만 JSONB + date 추가.***

## 중복/재선택 + 취소 처리 계획 (업데이트 기반)
- 요구: 동일 추천 이력에서 같은 메뉴를 다시 선택하면 새 row를 만들지 말고 덮어쓰며, 취소도 삭제가 아닌 업데이트로 처리.
- 저장/수정 로직
  - 기본 업서트 키: `selectionId`(응답의 id)로 대상 row를 찾아 덮어쓰기.
  - `selectionId` 없이 다시 선택을 보내는 경우: 같은 추천 이력+메뉴(`historyId + menuName`)가 있으면 그 row를 덮어쓰고, 없으면 새 row 생성.
- 취소 처리
  - 동일 키로 `cancel: true`(또는 `menuName` 빈 문자열) 요청 시 취소 상태로 업데이트(삭제하지 않음).
- 선택 조회/수정 API
  - 저장: `POST /menu/selections` (신규 생성)
  - 조회: `GET /menu/selections/history?date=YYYY-MM-DD` (전체/날짜별)
  - 수정/취소: `PATCH /menu/selections/:id` (selectionId로 대상 지정, payload로 menuName 변경 또는 cancel 플래그 전달)***

## 프론트 사용 가이드 (최소)
- 선택 저장: `POST /menu/selections` `{ "menuName": "비빔밥", "historyId": <추천이력id> }` (historyId는 추천 응답 id, 생략 가능). 응답 `id`가 selectionId.
- 선택 조회: `GET /menu/selections/history?date=YYYY-MM-DD` (date 생략 시 전체) → `selections[]`(id, menuName, selectedDate).
- 선택 수정/취소: `PATCH /menu/selections/:selectionId`
  - 재선택: `{ "menuName": "칼국수" }` → 해당 selection 덮어쓰기 + PENDING 처리
  - 취소: `{ "cancel": true }`(또는 `menuName: ""`) → 취소 상태로 업데이트(삭제 없음)***

### 엔드포인트별 응답 예시
- `POST /menu/selections` → `{ "selection": { "id": 1, "menuName": "비빔밥", "selectedDate": "2025-01-10", "historyId": 123 } }`
- `GET /menu/selections/history?date=2025-01-10` → `{ "selections": [ { "id": 1, "menuName": "비빔밥", "selectedDate": "2025-01-10" }, ... ] }`
- `PATCH /menu/selections/:id` → `{ "selection": { "id": 1, "menuName": "칼국수", "selectedDate": "2025-01-10", "historyId": 123 } }` (취소 시 `menuName`은 빈 문자열 또는 null, status는 내부적으로 CANCELLED)***

### 프론트 고려사항
- 같은 날짜에 여러 건이 저장될 수 있으므로 `selections` 배열을 그대로 렌더링하거나 필요 시 날짜별 그룹핑을 프론트에서 수행.
- `menuName`은 서버에서 jsonb `menuPayload.name`를 꺼내 제공하며, 취소된 건은 빈 문자열로 내려올 수 있으니 UI에서 필터링/표시 규칙 정의 필요.
- 재선택/취소 시에는 응답의 `id`(selectionId)로 `PATCH`를 호출해 덮어쓰거나 취소 처리(삭제 없이 상태 변경).
