# PickEat Backend 테스트 문서

이 디렉토리는 PickEat **Backend**의 테스트 전략, 시나리오, 결과, 회고록을 담고 있습니다.

## 문서 구조

### 📋 [테스트 전략 (test-strategy.md)](./test-strategy.md)
테스트 작성의 원칙과 규칙. 무엇을 테스트하고 무엇을 테스트하지 않을지 결정하는 기준.

### 📁 [시나리오 (scenarios/)](./scenarios/)
기능별 테스트 시나리오 체크리스트. 각 `[x]` / `[ ]`가 실제 테스트 코드와 1:1 매칭.

### 🔍 [회고록 (retrospective.md)](./retrospective.md) ⭐
테스트 전략을 현실에 적용하면서 발생한 주요 이슈의 근본 원인 분석과 교훈.
- **BE E2E 45건 실패 → 0건** — 타입 시스템 밖의 계약 검증

## 빠른 시작

### 테스트 실행
```bash
# 사전 요구사항: PostgreSQL + PostGIS, Redis 컨테이너 기동
docker-compose up -d

# Unit 테스트 (+ 커버리지)
pnpm run test:cov

# E2E 테스트 (NODE_ENV=test, E2E_MOCK=true)
NODE_ENV=test E2E_MOCK=true pnpm run test:e2e
```

## 결과

### 테스트 건수 및 커버리지

| Layer | Tests | Lines | Statements | Branches | Functions |
|---|---|---|---|---|---|
| Unit | 320 | 42.16% | 42.39% | 33.56% | 33.69% |
| E2E | 226 | 73.63% | 74.04% | 38.03% | 70.22% |
| **합산 (Unit ∪ E2E)** | **546** | **78.59%** | **78.69%** | 51.06% | 76.23% |

> 테스트 전략 §1 "적게 쓰고, 중요한 곳만, 제대로" 원칙에 따라,
> Unit은 핵심 비즈니스 로직만 얇게 커버하고, E2E가 실제 앱을 띄워 통합 경로를 두껍게 보호합니다.
> 두 계층의 합집합 **78.59%** 가 실제 코드베이스 safety net입니다.

### 기능별 시나리오 커버리지 맵

| 기능 | 시나리오 문서 | BE E2E | BE Unit |
|---|---|---|---|
| 인증 | [auth.md](./scenarios/auth.md) | 42/42 ✅ | 16/16 ✅ |
| 메뉴 추천 | [menu-recommendation.md](./scenarios/menu-recommendation.md) | 42/42 ✅ | 14/14 ✅ |
| 주소 | [address.md](./scenarios/address.md) | 43/43 ✅ | 7/5 ✅ |
| 사용자 | [user.md](./scenarios/user.md) | 18/18 ✅ | - |
| 사용자 장소 | [user-place.md](./scenarios/user-place.md) | 21/21 ✅ | - |
| 평점 | [rating.md](./scenarios/rating.md) | 16/16 ✅ | - |
| 버그 리포트 | [bug-report.md](./scenarios/bug-report.md) | 17/17 ✅ | - |
| 알림 / 관리자 | [admin.md](./scenarios/admin.md) | 26/26 ✅ | - |
| 배치 | [batch.md](./scenarios/batch.md) | - | 75/39 ✅ |
| 공통 인프라 | [common.md](./scenarios/common.md) | 1/1 ✅ | 31/31 ✅ |

> 위 테이블은 시나리오 문서와 직접 연결된 테스트만 집계합니다.
> 총 건수(Unit **320** / E2E **226**)는 테스트 러너 실측 기준이며,
> 테이블에 표시되지 않은 건수는 infrastructure / sub-service 내부 단위 테스트에서 발생합니다.

## 포트폴리오 포인트

1. **"적게 쓰고, 중요한 곳만"이 숫자로 증명됨** — Unit은 핵심 로직 42%, E2E가 주력 방어선 74%, 합집합 safety net 78.59%
2. **전략 → 시나리오 → 코드 3단 추적성** — 각 `[x]` 체크가 실제 `it()` 블록에 매칭
3. **회고록을 통한 시스템 개선** — 45건 실패를 14개 루트 원인 + 6패턴으로 구조화
4. **외부 API 경계 명확화** — OpenAI / Gemini / Google Places / Kakao / AWS S3 / Discord fixture 기반 mock 전략

## 관련 프로젝트

- [PickEat Frontend (pickeat_web)](https://github.com/LSJ0621/PickEat_FE_Web) — Frontend 테스트 문서는 해당 리포의 `docs/testing/` 참조
