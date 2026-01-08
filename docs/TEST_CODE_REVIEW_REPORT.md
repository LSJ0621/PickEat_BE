# Test Code Review Report

**Review Date**: 2026-01-06
**Total Files**: 67개
**Total Lines**: ~40,685줄
**Overall Grade**: B+ (Approve with Changes)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [P0 - Immediate Fixes (Merge Blockers)](#p0---immediate-fixes-merge-blockers)
3. [P1 - High Priority (Within Sprint)](#p1---high-priority-within-sprint)
4. [P2 - Medium Priority (Next Sprint)](#p2---medium-priority-next-sprint)
5. [P3 - Low Priority (Technical Debt)](#p3---low-priority-technical-debt)
6. [Group-by-Group Details](#group-by-group-details)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Executive Summary

| Group | Scope | Files | Lines | Critical | High | Grade |
|-------|-------|-------|-------|----------|------|-------|
| I | Mocks/Utils | 9 | ~1,442 | 3 | 8 | Approve with Changes |
| A | Auth | 9 | ~4,227 | 12 | 23 | B+ (85/100) |
| B | Menu Core | 7 | ~4,128 | 7 | 5 | Needs Revision |
| C | Menu GPT | 6 | ~2,938 | 2 | 6 | Approve with Changes |
| D | User | 7 | ~4,594 | 6 | 12 | Approve with Changes |
| E | External | 10 | ~4,260 | 1 | 4 | A+ |
| F | Infrastructure | 15 | ~4,403 | 1 | 4 | Approve with Changes |
| G | E2E | 5 | ~3,263 | 4 | 8 | Needs Revision |
| H | Integration | 3 | ~2,709 | 3 | 4 | Approve with Changes |

---

## P0 - Immediate Fixes (Merge Blockers)

### 1. Missing `import * as request from 'supertest'`

**File**: `test/e2e/user/user.e2e-spec.ts`
**Line**: Top of file
**Issue**: `request` is used but never imported

```typescript
// ADD at top of file
import * as request from 'supertest';
```

---

### 2. Undefined `accessToken` Variable

**File**: `test/e2e/auth/auth.e2e-spec.ts`
**Line**: ~425
**Issue**: Variable used without declaration

```typescript
// FIND this describe block around line 420
describe('POST /auth/refresh', () => {
  let refreshToken: string;
  let accessToken: string; // ADD this line
```

---

### 3. Add `jest.clearAllMocks()` to Missing Files

**Files to fix** (add `jest.clearAllMocks()` in `beforeEach`):

```
src/auth/__tests__/auth.controller.spec.ts
src/user/__tests__/services/user-address.service.spec.ts
src/user/__tests__/services/user-preference.service.spec.ts
src/user/__tests__/services/address-search.service.spec.ts
src/user/__tests__/services/admin-initializer.service.spec.ts
src/user/__tests__/preference-update-ai.service.spec.ts
src/external/__tests__/google/clients/google-oauth.client.spec.ts
src/external/__tests__/google/clients/google-places.client.spec.ts
src/external/__tests__/google/clients/google-search.client.spec.ts
src/external/__tests__/kakao/clients/kakao-oauth.client.spec.ts
src/external/__tests__/discord/clients/discord-webhook.client.spec.ts
src/__tests__/app.controller.spec.ts
src/common/__tests__/filters/http-exception.filter.spec.ts
```

**Fix pattern**:
```typescript
beforeEach(async () => {
  jest.clearAllMocks(); // ADD this as first line
  // ... rest of setup
});
```

---

### 4. Invalid ID Returns 500 Instead of 400

**File**: `src/bug-report/controllers/admin-bug-report.controller.ts`
**Issue**: Route parameter not validated

```typescript
// ADD ParseIntPipe to route parameter
import { ParseIntPipe } from '@nestjs/common';

@Get(':id')
async getBugReport(
  @Param('id', ParseIntPipe) id: number, // ADD ParseIntPipe
) { ... }
```

**Then update test** in `test/e2e/bug-report/bug-report.e2e-spec.ts`:
```typescript
// Change from:
.expect(500)
// To:
.expect(400)
```

---

### 5. Replace `as any` with Proper Enum Imports

**Files and fixes**:

#### auth-flow.integration.spec.ts
```typescript
// Line ~437, 511, 629
// BEFORE:
await userService.createOauth(googleSocialId, googleEmail, 'GOOGLE' as any, 'Test User');

// AFTER:
import { SocialType } from '@/user/entities/user.entity';
await userService.createOauth(googleSocialId, googleEmail, SocialType.GOOGLE, 'Test User');
```

#### menu-recommendation.integration.spec.ts
```typescript
// Lines ~703, 719
// BEFORE:
status: 'PENDING' as any,
status: 'SUCCEEDED' as any,

// AFTER:
import { MenuSelectionStatus } from '@/menu/entities/menu-selection.entity';
status: MenuSelectionStatus.PENDING,
status: MenuSelectionStatus.SUCCEEDED,
```

---

## P1 - High Priority (Within Sprint)

### 1. Replace All `as any` with `jest.Mocked<T>`

**Affected files**: ALL test files
**Effort**: ~4 hours

**Pattern to fix**:
```typescript
// BEFORE (BAD)
let mockService: any;
mockService = {
  method: jest.fn(),
} as any;

// AFTER (GOOD)
let mockService: jest.Mocked<ServiceType>;
mockService = {
  method: jest.fn(),
} as jest.Mocked<ServiceType>;
```

**Key files with most violations**:
- `src/auth/__tests__/auth.service.spec.ts` (lines 616-620, 628-633)
- `src/user/__tests__/user.service.spec.ts` (lines 595-600, transaction mocks)
- `src/user/__tests__/preference-update-ai.service.spec.ts` (lines 189-192)
- `src/menu/__tests__/menu.service.spec.ts` (lines 27, 33, 41)
- `test/integration/auth/auth-flow.integration.spec.ts` (lines 93, 96)

---

### 2. Add Error Response Body Validation

**Affected files**: All E2E test files
**Effort**: ~2 hours

**Pattern to fix**:
```typescript
// BEFORE (incomplete)
await request(app.getHttpServer())
  .post('/auth/register')
  .send(registerDto)
  .expect(400);

// AFTER (complete)
const response = await request(app.getHttpServer())
  .post('/auth/register')
  .send(registerDto)
  .expect(400);

expect(response.body).toHaveProperty('statusCode', 400);
expect(response.body).toHaveProperty('message');
```

---

### 3. Add Error Path Side-Effect Assertions

**Affected files**: Service spec files
**Effort**: ~2 hours

**Pattern to fix**:
```typescript
// BEFORE
await expect(service.deleteUser(email)).rejects.toThrow(NotFoundException);

// AFTER (add side-effect verification)
await expect(service.deleteUser(email)).rejects.toThrow(NotFoundException);
expect(mockRepository.save).not.toHaveBeenCalled();
expect(mockRepository.softRemove).not.toHaveBeenCalled();
```

**Key files**:
- `src/user/__tests__/user.service.spec.ts` (lines 635, 662)
- `src/menu/__tests__/services/menu-recommendation.service.spec.ts` (lines 170-178)

---

### 4. Standardize OpenAI Mock Usage

**Affected files**: Menu test files
**Effort**: ~1 hour

**Files to update**:
```
src/menu/__tests__/services/openai-places.service.spec.ts
src/menu/__tests__/gpt/base-menu.service.spec.ts
src/menu/__tests__/gpt/gpt4o-mini-validation.service.spec.ts
```

**Fix**: Use shared factory instead of inline mocks:
```typescript
// BEFORE (inline mock)
mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
} as any;

// AFTER (shared factory)
import { createMockOpenAI } from '../../../../test/mocks/openai.mock';
mockOpenAI = createMockOpenAI();
```

---

### 5. Remove Commented Unused Variables

**File**: `test/integration/menu/menu-recommendation.integration.spec.ts`
**Lines**: 103, 119, 189, 226
**Effort**: 15 minutes

```typescript
// DELETE these lines:
// let twoStageMenuService: TwoStageMenuService; // Line 103
// let testAddress: UserAddress; // Line 119
// testAddress = await userAddressRepository.save(...); // Line 189
```

---

## P2 - Medium Priority (Next Sprint)

### 1. Extract Magic Numbers to Constants

**Files**: Multiple
**Effort**: ~1 hour

```typescript
// BEFORE
await new Promise((resolve) => setTimeout(resolve, 1000));
latitude: 37.5012345,
longitude: 127.0398765,

// AFTER
const TOKEN_IAT_DELAY_MS = 1000;
const TEST_COORDINATES = {
  GANGNAM: { lat: 37.5012345, lon: 127.0398765 },
};
```

---

### 2. Add Token Expiry Tests

**File**: `test/e2e/auth/auth.e2e-spec.ts`
**Effort**: ~1 hour

```typescript
// ADD new test
it('should reject expired access token', async () => {
  const jwt = require('jsonwebtoken');
  const expiredToken = jwt.sign(
    { email: 'test@example.com', role: 'USER' },
    process.env.JWT_SECRET,
    { expiresIn: '-1h' }
  );

  await request(app.getHttpServer())
    .get('/auth/me')
    .set('Authorization', `Bearer ${expiredToken}`)
    .expect(401);
});
```

---

### 3. Add Concurrent Operation Tests

**File**: `test/e2e/user/user.e2e-spec.ts`
**Effort**: ~2 hours

```typescript
// ADD new test for optimistic locking
it('should handle concurrent user updates with optimistic locking', async () => {
  // Simulate concurrent updates to same user
  await Promise.all([
    request(app.getHttpServer())
      .patch('/user')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Update 1' }),
    request(app.getHttpServer())
      .patch('/user')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Update 2' }),
  ]);

  // One should succeed, one should get 409 Conflict
});
```

---

### 4. Create Shared E2E Assertion Helpers

**New file**: `test/utils/e2e-assertions.ts`
**Effort**: ~1 hour

```typescript
export class E2EAssertions {
  static expectErrorResponse(
    response: any,
    statusCode: number,
    messagePattern?: string | RegExp
  ) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('statusCode', statusCode);
    expect(response.body).toHaveProperty('message');

    if (messagePattern) {
      if (typeof messagePattern === 'string') {
        expect(response.body.message).toContain(messagePattern);
      } else {
        expect(response.body.message).toMatch(messagePattern);
      }
    }
  }

  static expectPaginatedResponse(
    response: any,
    expectedItemCount: number,
    page = 1,
    limit = 20
  ) {
    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('pageInfo');
    expect(response.body.items).toHaveLength(expectedItemCount);
    expect(response.body.pageInfo).toMatchObject({ page, limit });
  }
}
```

---

### 5. Add Prometheus Metrics Validation

**Files**: External client test files
**Effort**: ~1 hour

```typescript
// Add to tests that use Prometheus
expect(mockPrometheusService.recordAiSuccess).toHaveBeenCalledWith(
  'menu',
  expectedTokenCount
);
expect(mockPrometheusService.recordAiDuration).toHaveBeenCalledWith(
  'menu',
  expect.any(Number)
);
```

---

## P3 - Low Priority (Technical Debt)

### 1. Remove Debug console.log Statements

**File**: `test/e2e/menu/menu.e2e-spec.ts`
**Lines**: 116-123

```typescript
// DELETE this block:
if (response.status !== 201) {
  console.log('Response status:', response.status);
  console.log('Response body:', JSON.stringify(response.body, null, 2));
  console.log(
    'mockChatCompletionsCreate called',
    mockChatCompletionsCreate.mock.calls.length,
    'times',
  );
}
```

---

### 2. Improve Test Descriptions

**Pattern**:
```typescript
// BEFORE
it('should be defined', () => { ... });

// AFTER
it('should instantiate controller with all dependencies', () => { ... });
```

---

### 3. Add JSDoc Comments to Test Helpers

**File**: `test/utils/test-helpers.ts`

```typescript
/**
 * Creates a mock service with specified methods as jest.fn()
 * @param methods - Array of method names to mock
 * @returns Mocked service object with type safety
 */
export function createMockService<T>(methods: (keyof T)[]): jest.Mocked<T> {
  // ...
}
```

---

### 4. Create Test Data Constants File

**New file**: `test/fixtures/test-data.ts`

```typescript
export const TEST_ADDRESSES = {
  GANGNAM_STATION: {
    roadAddress: '서울특별시 강남구 테헤란로 123',
    postalCode: '06234',
    latitude: 37.5012345,
    longitude: 127.0398765,
  },
  SEOUL_CITY_HALL: {
    roadAddress: '서울특별시 중구 세종대로 110',
    postalCode: '04524',
    latitude: 37.5665,
    longitude: 126.9780,
  },
};

export const TEST_MENUS = {
  KOREAN: ['김치찌개', '된장찌개', '비빔밥'],
  CHINESE: ['짜장면', '짬뽕', '탕수육'],
  JAPANESE: ['라멘', '초밥', '돈카츠'],
};

export const TEST_USERS = {
  NORMAL: {
    email: 'test@example.com',
    password: 'Test1234!',
    name: 'Test User',
  },
  ADMIN: {
    email: 'admin@example.com',
    password: 'Admin1234!',
    name: 'Admin User',
  },
};
```

---

## Group-by-Group Details

### Group I - Mocks/Utils (9 files)

**Critical Issues**:
1. `createMockOpenAIWithResponse(response: any)` uses `any` type
2. Google Places mock schema mismatch (has `languageCode` but type doesn't)
3. UserFactory defaults `name` to 'Test User' but entity allows null

**Files**:
```
test/mocks/external-clients.mock.ts
test/mocks/repository.mock.ts
test/mocks/openai.mock.ts
test/mocks/openai.setup.ts
test/utils/test-helpers.ts
test/factories/entity.factory.ts
test/e2e/setup/testing-app.module.ts
test/e2e/setup/test-database.setup.ts
test/e2e/setup/auth-test.helper.ts
```

---

### Group A - Auth (9 files)

**Critical Issues**:
1. Excessive `as any` usage (~35+ instances)
2. Missing shared factory usage for user creation
3. Missing token expiry tests

**Files**:
```
src/auth/__tests__/auth.service.spec.ts
src/auth/__tests__/auth.controller.spec.ts
src/auth/__tests__/services/auth-token.service.spec.ts
src/auth/__tests__/services/auth-social.service.spec.ts
src/auth/__tests__/services/email-verification.service.spec.ts
src/auth/__tests__/provider/jwt-token.provider.spec.ts
src/auth/__tests__/strategy/jwt.strategy.spec.ts
src/auth/__tests__/strategy/local.strategy.spec.ts
src/auth/__tests__/guard/roles.guard.spec.ts
```

---

### Group B - Menu Core (7 files)

**Critical Issues**:
1. `as any` type casting for mocks
2. MenuSelection.menuPayload schema not validated against entity
3. Complex assertion patterns in scheduler tests

**Files**:
```
src/menu/__tests__/menu.service.spec.ts
src/menu/__tests__/menu.controller.spec.ts
src/menu/__tests__/menu-payload.util.spec.ts
src/menu/__tests__/preferences.scheduler.spec.ts
src/menu/__tests__/services/menu-recommendation.service.spec.ts
src/menu/__tests__/services/menu-selection.service.spec.ts
src/menu/__tests__/services/place.service.spec.ts
```

---

### Group C - Menu GPT (6 files)

**Critical Issues**:
1. OpenAI mock structure doesn't match SDK
2. Missing prompt builder validation tests

**Files**:
```
src/menu/__tests__/services/openai-menu.service.spec.ts
src/menu/__tests__/services/openai-places.service.spec.ts
src/menu/__tests__/services/two-stage-menu.service.spec.ts
src/menu/__tests__/gpt/base-menu.service.spec.ts
src/menu/__tests__/gpt/gpt4o-mini-validation.service.spec.ts
src/menu/__tests__/gpt/gpt51-menu.service.spec.ts
```

---

### Group D - User (7 files)

**Critical Issues**:
1. Transaction mock uses `as any` extensively
2. Missing `jest.clearAllMocks()` in some files
3. UserFactory name field doesn't handle null properly

**Files**:
```
src/user/__tests__/user.service.spec.ts
src/user/__tests__/user.controller.spec.ts
src/user/__tests__/preference-update-ai.service.spec.ts
src/user/__tests__/services/user-address.service.spec.ts
src/user/__tests__/services/user-preference.service.spec.ts
src/user/__tests__/services/address-search.service.spec.ts
src/user/__tests__/services/admin-initializer.service.spec.ts
```

---

### Group E - External Clients (10 files)

**Overall**: A+ quality, excellent coverage

**Minor Issues**:
1. Missing `jest.clearAllMocks()` in 7 files
2. Duplicate `createAxiosError` in kakao-local.client.spec.ts

**Files**:
```
src/external/__tests__/google/clients/google-oauth.client.spec.ts
src/external/__tests__/google/clients/google-places.client.spec.ts
src/external/__tests__/google/clients/google-search.client.spec.ts
src/external/__tests__/kakao/clients/kakao-oauth.client.spec.ts
src/external/__tests__/kakao/clients/kakao-local.client.spec.ts
src/external/__tests__/naver/clients/naver-map.client.spec.ts
src/external/__tests__/naver/clients/naver-search.client.spec.ts
src/external/__tests__/naver/services/location.service.spec.ts
src/external/__tests__/aws/clients/s3.client.spec.ts
src/external/__tests__/discord/clients/discord-webhook.client.spec.ts
```

---

### Group F - Infrastructure (15 files)

**Highlights**:
- HttpExceptionFilter: Excellent edge case coverage
- HttpMetricsInterceptor: Outstanding coverage (883 lines)

**Minor Issues**:
1. app.controller.spec.ts is minimal (only 1 test)
2. map.controller.spec.ts needs expansion

**Files**:
```
src/__tests__/app.controller.spec.ts
src/common/__tests__/filters/http-exception.filter.spec.ts
src/common/__tests__/interceptors/http-metrics.interceptor.spec.ts
src/common/__tests__/pipeline/pipeline.spec.ts
src/bug-report/__tests__/bug-report.controller.spec.ts
src/bug-report/__tests__/bug-report.service.spec.ts
src/bug-report/__tests__/controllers/admin-bug-report.controller.spec.ts
src/bug-report/__tests__/services/bug-report-notification.service.spec.ts
src/bug-report/__tests__/services/bug-report-scheduler.service.spec.ts
src/bug-report/__tests__/services/discord-message-builder.service.spec.ts
src/bug-report/__tests__/utils/discord-format.util.spec.ts
src/map/__tests__/map.controller.spec.ts
src/map/__tests__/map.service.spec.ts
src/search/__tests__/search.controller.spec.ts
src/search/__tests__/search.service.spec.ts
```

---

### Group G - E2E (5 files)

**Critical Issues**:
1. Missing `request` import in user.e2e-spec.ts
2. Undefined `accessToken` in auth.e2e-spec.ts
3. Invalid ID returns 500 instead of 400

**Files**:
```
test/e2e/auth/auth.e2e-spec.ts
test/e2e/user/user.e2e-spec.ts
test/e2e/menu/menu.e2e-spec.ts
test/e2e/bug-report/bug-report.e2e-spec.ts
test/e2e/search/search.e2e-spec.ts
```

---

### Group H - Integration (3 files)

**Critical Issues**:
1. `as any` for SocialType and MenuSelectionStatus
2. Commented unused variables
3. Missing specific error message assertions

**Files**:
```
test/integration/auth/auth-flow.integration.spec.ts
test/integration/bug-report/bug-report-flow.integration.spec.ts
test/integration/menu/menu-recommendation.integration.spec.ts
```

---

## Cross-Cutting Concerns

### 1. Type Safety Pattern

**Current (Bad)**:
```typescript
mockService = { method: jest.fn() } as any;
```

**Recommended (Good)**:
```typescript
mockService = { method: jest.fn() } as jest.Mocked<ServiceType>;
```

---

### 2. Mock Cleanup Pattern

**Recommended**:
```typescript
beforeEach(async () => {
  jest.clearAllMocks(); // ALWAYS first
  // ... rest of setup
});
```

---

### 3. Error Assertion Pattern

**Current (Incomplete)**:
```typescript
await expect(service.method()).rejects.toThrow();
```

**Recommended (Complete)**:
```typescript
await expect(service.method()).rejects.toThrow(NotFoundException);
expect(mockRepository.save).not.toHaveBeenCalled(); // Verify no side effects
```

---

### 4. E2E Response Validation Pattern

**Current (Incomplete)**:
```typescript
.expect(400);
```

**Recommended (Complete)**:
```typescript
const response = await request(app.getHttpServer())
  .post('/endpoint')
  .send(dto)
  .expect(400);

expect(response.body).toMatchObject({
  statusCode: 400,
  message: expect.any(String),
});
```

---

## Estimated Fix Times

| Priority | Issues | Estimated Time |
|----------|--------|----------------|
| P0 | 5 items | ~2 hours |
| P1 | 5 items | ~10 hours |
| P2 | 5 items | ~7 hours |
| P3 | 4 items | ~3.5 hours |
| **Total** | **19 items** | **~22.5 hours** |

---

## Verification Checklist

After fixing P0 items, run:

```bash
# Run all tests
pnpm run test

# Run E2E tests
pnpm run test:e2e

# Run integration tests
pnpm run test:integration

# Check for any remaining type errors
pnpm run build
```

All tests should pass before merging.
