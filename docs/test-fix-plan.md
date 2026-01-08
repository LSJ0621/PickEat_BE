# Test Code Issue Resolution Plan

## Executive Summary
검증에서 발견된 14개 CRITICAL + 14개 WARNING 이슈를 5개 Phase로 그룹화하여 수정합니다.
커스텀 서브에이전트(code-quality-manager, test-code-writer, code-reviewer)를 활용하여 토큰 사용량을 최적화합니다.

**예상 토큰 절약**: ~240K → ~100K (58% 절감)

---

## 발견된 문제 목록

### CRITICAL Issues (14개)

| ID | Category | Issue | Root Cause |
|----|----------|-------|------------|
| C1 | Integration | auth-flow: 이메일 인증 검증 로직 누락 | Registration flow에서 verification check 생략 |
| C2 | Integration | auth-flow: Refresh Token 테스트 실패 | email mismatch로 User lookup 실패 |
| C3 | Integration | auth-flow: Kakao socialId 타입 불일치 | number vs string 타입 불일치 |
| C4 | Integration | menu-recommendation: FK constraint 위반 (4건) | 잘못된 삭제 순서 |
| C5 | Integration | bug-report-flow: 데이터 조회 실패 | ID mismatch |
| C6 | E2E | auth: Refresh Token 쿠키 인증 실패 | Cookie parsing 문제 |
| C7 | E2E | user: 동시성 테스트 격리 실패 | 병렬 테스트 간 상태 공유 |
| C8 | E2E | menu: FK constraint 위반 (12건) | beforeEach 삭제 순서 문제 |
| C9 | Unit | Common 모듈 커버리지 0% | Jest config rootDir 문제 |
| C10 | Unit | Bug Report 모듈 Branch 커버리지 86% | 브랜치 테스트 케이스 누락 |

### WARNING Issues (14개)

| ID | Category | Issue |
|----|----------|-------|
| W1 | Type Safety | Repository Mock이 `jest.Mocked<any>` 사용 |
| W2 | Type Safety | jwt.strategy.spec.ts: 14개 `as any` 캐스팅 |
| W3 | Anti-pattern | auth.service.spec.ts: Private 메서드 테스트 |
| W4 | Coverage | current-user.decorator.ts: 33% 커버리지 |
| W5 | Type Safety | external-clients.mock.ts: 7개 `any` 타입 |
| W6 | Resource | Worker process exit 경고 |
| W7 | DB | Cleanup 순서 문제 (child tables first 필요) |
| W8 | Test Structure | 중첩된 describe/beforeEach 충돌 |
| W9 | Config | jest-integration.json rootDir 문제 |
| W10 | Usage | E2EAssertions 헬퍼 미사용 |
| W11 | Resource | Jest 프로세스 미종료 (DB 연결) |
| W12 | Coverage | bug-report-scheduler.service.ts Branch 50% |
| W13 | Coverage | discord-message-builder.service.ts Branch 83% |
| W14 | Type Safety | `as unknown as Date` 패턴 |

---

## Work Grouping Strategy

| Group | Issues | Sub-agent | Parallel |
|-------|--------|-----------|----------|
| 1. DB Cleanup & Isolation | C4, C5, C7, C8, W7, W11 | code-quality-manager | Yes (4 tasks) |
| 2. Auth Flow Fixes | C1, C2, C3, C6 | code-quality-manager | No (sequential) |
| 3. Type Safety | W1, W2, W5, W14 | code-quality-manager | Yes (4 tasks) |
| 4. Coverage Improvement | C9, C10, W4, W12, W13 | test-code-writer | Yes (5 tasks) |
| 5. Structure & Config | W3, W8, W9, W10, W6 | code-reviewer → code-quality-manager | No |

---

## Phase 1: Database Cleanup Infrastructure
**Sub-agent**: code-quality-manager (병렬 4개 task)

### Task 1.1: test-database.setup.ts 삭제 순서 수정
```
File: test/e2e/setup/test-database.setup.ts
Action: FK constraint를 고려한 삭제 순서로 변경
Order: PlaceRecommendation → MenuSelection → MenuRecommendation →
       BugReportNotification → BugReport → UserAddress →
       EmailVerification → User
```

### Task 1.2: E2E beforeEach cleanup 수정
```
Files:
- test/e2e/auth/auth.e2e-spec.ts
- test/e2e/user/user.e2e-spec.ts
- test/e2e/menu/menu.e2e-spec.ts
- test/e2e/bug-report/bug-report.e2e-spec.ts
Action: FK constraint 순서 적용
```

### Task 1.3: Integration test cleanup 수정
```
Files:
- test/integration/auth/auth-flow.integration.spec.ts
- test/integration/menu/menu-recommendation.integration.spec.ts
- test/integration/bug-report/bug-report-flow.integration.spec.ts
Action: 동일한 삭제 순서 적용
```

### Task 1.4: afterAll DB 연결 정리 추가
```
File: test/jest-setup.ts
Action: global afterAll hook으로 DB 연결 종료
```

**검증 명령어**: `pnpm test:e2e --testPathPattern="auth|user|menu"`

---

## Phase 2: Authentication Flow Fixes
**Sub-agent**: code-quality-manager (순차 실행)

### Task 2.1: Kakao socialId 타입 일관성 수정
```
Files:
- test/mocks/external-clients.mock.ts (id: number → string 변환)
- test/integration/auth/auth-flow.integration.spec.ts
Action: Number를 String으로 변환하여 저장 (Kakao API는 number 반환, DB는 string 저장)
```

### Task 2.2: 이메일 인증 검증 로직 수정
```
File: test/integration/auth/auth-flow.integration.spec.ts
Action: 회원가입 전 verification status 올바르게 설정
```

### Task 2.3: Refresh Token 테스트 수정
```
Files:
- test/integration/auth/auth-flow.integration.spec.ts
- test/e2e/auth/auth.e2e-spec.ts
Action: User lookup 시 email/token 연관 확인
```

### Task 2.4: Cookie 인증 수정
```
File: test/e2e/auth/auth.e2e-spec.ts
Action: cookie-parser 미들웨어 적용 확인
```

**검증 명령어**: `pnpm test --config test/jest-integration.json --testPathPattern="auth-flow"`

---

## Phase 3: Type Safety Improvements
**Sub-agent**: code-quality-manager (병렬 4개 task)

### Task 3.1: Repository mock 타입 개선
```
File: test/mocks/repository.mock.ts
Action: jest.Mocked<any> → 구체적 타입으로 변경
```

### Task 3.2: jwt.strategy.spec.ts 타입 캐스팅 수정
```
File: src/auth/__tests__/strategy/jwt.strategy.spec.ts
Action: as any (14개) → MockRequest interface 정의
```

### Task 3.3: external-clients.mock.ts any 타입 수정
```
File: test/mocks/external-clients.mock.ts
Lines: 17, 33, 47, 55
Action: axios 타입 import하여 적용
```

### Task 3.4: Date 타입 패턴 수정
```
File: src/auth/__tests__/services/email-verification.service.spec.ts
Action: as unknown as Date → proper Date mock
```

**검증 명령어**: `pnpm run lint`

---

## Phase 4: Coverage Improvements
**Sub-agent**: test-code-writer (병렬 5개 task)

### Task 4.1: Jest config 수정 (Common 모듈 커버리지)
```
Files: test/jest-integration.json, jest.config.js
Action: rootDir 및 collectCoverageFrom 경로 수정
```

### Task 4.2: current-user.decorator 테스트 추가
```
Create: src/auth/__tests__/decorators/current-user.decorator.spec.ts
Tests:
- Valid user extraction
- Missing user throws UnauthorizedException
- Missing email throws UnauthorizedException
- Edge cases (null, undefined)
```

### Task 4.3: bug-report-scheduler 브랜치 커버리지 개선
```
File: src/bug-report/__tests__/services/bug-report-scheduler.service.spec.ts
Missing branches:
- currentThreshold === null edge case
- Different threshold levels (30, 50)
- Empty recentBugs array
```

### Task 4.4: discord-message-builder 브랜치 커버리지 개선
```
File: src/bug-report/__tests__/services/discord-message-builder.service.spec.ts
Missing branches:
- lastThreshold === 0
- recentBugs.length === RECENT_BUGS_COUNT
```

### Task 4.5: Bug Report 전체 브랜치 커버리지 90% 달성
```
Files: src/bug-report/__tests__/**/*.spec.ts
Action: 누락된 브랜치 테스트 추가
```

**검증 명령어**: `pnpm test:cov`

---

## Phase 5: Test Structure & Configuration
**Sub-agents**: code-reviewer → code-quality-manager (순차)

### Task 5.1: auth.service.spec.ts 안티패턴 제거
```
File: src/auth/__tests__/auth.service.spec.ts
Action: private 메서드 직접 테스트 → public API 통한 테스트로 변경
```

### Task 5.2: 중첩된 describe/beforeEach 충돌 수정
```
Files: Multiple spec files
Action: beforeEach 스코프 명확히 분리
```

### Task 5.3: jest-integration.json rootDir 확인
```
File: test/jest-integration.json
Action: 경로 설정 검증 및 수정
```

### Task 5.4: E2EAssertions 헬퍼 적용 또는 제거
```
File: test/utils/e2e-assertions.ts
Action: E2E 테스트에 통합 또는 불필요시 제거
```

### Task 5.5: Worker process exit 경고 해결
```
File: test/jest-setup.ts
Action: open handles (timers, connections) cleanup 추가
```

**검증 명령어**: `pnpm test && pnpm test:e2e`

---

## Execution Timeline

```
Phase 1 (병렬 4 tasks)     [===============]     ~15K tokens
        ↓
Phase 2 (순차 4 tasks)     [===================] ~20K tokens
        ↓
Phase 3 (병렬 4 tasks)     [===============]     ~12K tokens
        ↓
Phase 4 (병렬 5 tasks)     [=====================] ~35K tokens
        ↓
Phase 5 (순차 5 tasks)     [=================]   ~18K tokens
        ↓
Final Verification         pnpm test:cov && pnpm test:e2e
```

---

## Sub-agent Prompts Summary

### code-quality-manager 사용 시
```
- 특정 파일과 에러 메시지만 제공 (context 최소화)
- 유사한 수정사항 일괄 처리
- 삭제 순서 같은 반복 패턴은 템플릿 제공
```

### test-code-writer 사용 시
```
- 기존 테스트 파일을 템플릿으로 제공
- 필요한 테스트 케이스 명확히 목록화
- 커버리지 필요한 브랜치 라인번호 명시
```

### code-reviewer 사용 시
```
- 구조적 문제가 있는 파일만 리뷰 요청
- 액션 가능한 항목만 출력 요청
- 안티패턴에만 집중
```

---

## Critical Files

1. `test/e2e/setup/test-database.setup.ts` - DB cleanup 로직
2. `test/mocks/external-clients.mock.ts` - Mock 타입 및 socialId
3. `test/integration/auth/auth-flow.integration.spec.ts` - Auth 테스트
4. `src/auth/__tests__/strategy/jwt.strategy.spec.ts` - 타입 안전성
5. `test/jest-setup.ts` - 리소스 정리

---

## Final Verification Commands

```bash
# 전체 테스트 실행
pnpm test:cov                                    # Unit test + coverage
pnpm test --config test/jest-integration.json   # Integration test
pnpm test:e2e                                    # E2E test

# 커버리지 목표 확인 (모두 90% 이상)
# - Branches >= 90%
# - Functions >= 90%
# - Lines >= 90%
# - Statements >= 90%
```

---

## 실행 방법

새 세션에서 이 계획을 실행하려면:

1. 이 문서를 읽고 전체 계획 파악
2. Phase 1부터 순서대로 진행
3. 각 Phase 완료 후 검증 명령어 실행
4. 문제 발생 시 해당 Task 재수행
5. 모든 Phase 완료 후 Final Verification 실행

**Claude에게 전달할 프롬프트 예시:**
```
docs/test-fix-plan.md 파일을 읽고, Phase 1부터 테스트 코드 수정 작업을 시작해줘.
각 Phase에서 명시된 sub-agent (code-quality-manager, test-code-writer, code-reviewer)를 활용하고,
병렬 실행 가능한 작업은 병렬로 처리해줘.
```
