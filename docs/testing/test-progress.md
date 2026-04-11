# PickEat Backend 테스트 진행 현황

> 이 문서는 **AI가 세션 시작 시 가장 먼저 읽어야 하는 문서**입니다.
> 전체 진행 상황을 파악하고, 다음 작업을 결정하는 데 사용합니다.

## 참조 문서

- 테스트 전략/철학/규칙: [test-strategy.md](./test-strategy.md)
- 기능별 상세 시나리오: [scenarios/](./scenarios/)

---

## 전체 진행 현황

> 형식: 테스트 수/시나리오 수 (테스트가 있는 시나리오만 ✅)

| 기능 | 시나리오 문서 | BE E2E | BE Unit | 상태 |
|------|-------------|--------|---------|------|
| 인증 | [auth.md](scenarios/auth.md) | 42/42 ✅ | 16/16 ✅ | **완료** |
| 메뉴 추천 | [menu-recommendation.md](scenarios/menu-recommendation.md) | 39/39 ✅ | 14/14 ✅ | **완료** |
| 주소 | [address.md](scenarios/address.md) | 36/36 ✅ | 7/5 ✅ | **완료** |
| 사용자 | [user.md](scenarios/user.md) | 18/18 ✅ | - | **완료** |
| 사용자 장소 | [user-place.md](scenarios/user-place.md) | 14/14 ✅ | - | **완료** |
| 평점 | [rating.md](scenarios/rating.md) | 16/16 ✅ | - | **완료** |
| 버그 리포트 | [bug-report.md](scenarios/bug-report.md) | 11/11 ✅ | - | **완료** |
| 알림/관리자 | [admin.md](scenarios/admin.md) | 26/26 ✅ | - | **완료** |
| 공통 인프라 | [common.md](scenarios/common.md) | 1/1 ✅ | 31/31 ✅ | **완료** |

**BE E2E 전체**: 203/203 (100% — 전체 통과, 2026-04-11 검증 완료)
**BE Unit 전체**: 68 테스트 (구현된 시나리오 모두 통과)

---

## 작업 순서

### Phase 0: 준비 (기존 테스트 삭제 + 인프라 세팅)

- [x] 기존 테스트 파일 삭제 (인프라 유지) — 기존 테스트 파일 없음
- [x] Backend: supertest + 테스트 DB 환경 구성 — supertest 7.2.2 설치, .env.test + docker-compose 완비
- [x] Backend: 외부 API fixture 수집 (실제 응답 JSON 저장) — src/external/mocks/fixtures/ + test/mocks/ 완비
- [x] Backend: API 테스트용 공통 setup 작성 (AppModule override) — test/e2e/setup/ (app-setup, db-cleanup, auth-helpers)

### Phase 1: 인증 (auth)

1. Backend API 테스트 → Backend Unit 테스트

### Phase 2: 메뉴 추천 (menu-recommendation)

1. Backend API 테스트 → Backend Unit 테스트

### Phase 3: 주소 (address)

1. Backend API 테스트 → Backend Unit 테스트

### Phase 4: 나머지 기능

1. 사용자 (user) — BE API
2. 사용자 장소 (user-place) — BE API
3. 평점 (rating) — BE API
4. 버그 리포트 (bug-report) — BE API
5. 알림/관리자 (admin) — BE API

### Phase 5: 공통 인프라

1. Guard/Pipe Unit 테스트

---

## 세션 로그

> 각 세션 종료 시 아래에 작업 내용을 기록합니다.

| 날짜 | 작업 내용 | 완료 항목 |
|------|----------|----------|
| 2026-04-10 | 테스트 전략 수립, 문서 구조 설계 | test-strategy.md, 시나리오 문서 작성 |
| 2026-04-10 | Phase 0 완료 + Phase 1 인증 테스트 작성 | BE API 42개, BE Unit 14개 |
| 2026-04-10 | Phase 2 메뉴 추천 테스트 작성 | BE API 39개, BE Unit 13개 |
| 2026-04-10 | Phase 3 주소 테스트 작성 | BE API 35개, BE Unit 7개 |
| 2026-04-10 | Phase 4 나머지 기능 테스트 작성 | User 16, UserPlace 13, Rating 11, BugReport 7, Admin 25 |
| 2026-04-10 | Phase 5 공통 인프라 테스트 작성 | BE Unit 30개 — **전체 완료** |
| 2026-04-11 | BE E2E 전체 수정 (45개 실패 → 0개) | 소스 10파일 + 테스트 7파일 수정. 패턴: @HttpCode 누락(4), 응답구조 불일치(3), OpenAI mock 우선순위(1), 404/403→400 반영(2), AdminNotification 모듈 미등록(1), 개별이슈(Redis 캐시 leak, 토큰 jti, spread 순서 등) |
| 2026-04-11 | 시나리오 문서 보정 | 실제 테스트 코드와 1:1 대조. 누락 시나리오 추가 (auth +3, address +21, user +2, user-place +1, rating +5, admin +1, common +6, menu +1), 전체 체크박스 [x] 업데이트, progress 숫자 보정 |

---

## AI 작업 가이드

### 세션 시작 시

1. 이 문서(`test-progress.md`)를 읽어 전체 현황 파악
2. "전체 진행 현황" 표에서 "미착수" 또는 진행 중인 기능 확인
3. 해당 기능의 `scenarios/{기능}.md`를 읽어 구체적 시나리오 확인
4. `test-strategy.md`의 규칙에 따라 테스트 작성

### 세션 종료 시

1. 완료한 시나리오의 `[ ]`를 `[x]`로 변경
2. 이 문서의 "전체 진행 현황" 표 숫자 업데이트
3. "세션 로그"에 작업 내용 기록

### 테스트 작성 순서 (각 기능 내)

```
Backend API 테스트 → Backend Unit 테스트
```

각 단계에서 `test-strategy.md`의 규칙을 따른다:
- 행동(결과) 검증, 구현 검증 금지
- Mock은 외부 API Client만
- 테스트 이름은 시나리오를 설명
- Factory로 테스트 데이터 생성
