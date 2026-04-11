# PickEat Backend 테스트 전략

## 목차

1. [테스트 철학](#1-테스트-철학)
2. [테스트 유형과 역할](#2-테스트-유형과-역할)
3. [Backend 테스트 전략](#3-backend-테스트-전략)
4. [외부 API 테스트 전략](#4-외부-api-테스트-전략)
5. [테스트 작성 규칙](#5-테스트-작성-규칙)
6. [디렉토리 구조](#6-디렉토리-구조)
7. [테스트 실행](#7-테스트-실행)

---

## 1. 테스트 철학

### 원칙

**적게 쓰고, 중요한 곳만, 제대로.**

- 50개 서비스를 대충 테스트하지 말고, 핵심 7개를 제대로 테스트한다
- 가짜(mock) 덩어리 테스트보다, 진짜 앱을 띄워서 검증하는 테스트를 우선한다
- "이 테스트가 없으면 배포할 때 뭐가 터질 수 있는가?"로 테스트 대상을 결정한다

### 테스트하는 것 vs 안 하는 것

| 테스트한다 | 테스트하지 않는다 |
|-----------|----------------|
| API 엔드포인트 요청/응답 (DTO 검증 포함) | 단순 CRUD 서비스 로직 (API 테스트에서 간접 커버) |
| 복잡한 비즈니스 로직 (추천, 배치, 인증) | Entity/DTO 클래스 자체 |
| 외부 API 응답 파싱/에러 처리 | TypeORM Repository 메서드 |
| Guard, Pipe (보안/검증) | 단순 getter/setter |

### 테스트 비중

```
Backend:
  API 테스트 (supertest + 실제 DB)  ████████████████  60%
  비즈니스 로직 Unit 테스트          ██████████        30%
  Guard/Pipe Unit 테스트            ████              10%
```

---

## 2. 테스트 유형과 역할

### 2.1 API 테스트 (Backend 메인)

**역할**: 실제 앱을 띄우고 HTTP 요청을 보내서, 요청부터 응답까지 전체 흐름을 검증한다.

**검증 대상**:
- DTO 필드 검증 (필수 필드 누락, 잘못된 타입)
- Guard 동작 (인증 안 된 요청 차단)
- Pipe 동작 (파일 크기/형식 검증)
- 서비스 로직 (DB에 실제로 저장되는 결과)
- 응답 형태 (민감 정보 미노출, 올바른 상태 코드)
- 에러 처리 (존재하지 않는 리소스 조회, 권한 없는 접근)

**구조**:
```typescript
// 실제 앱 + 실제 DB + 외부 API만 mock
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GeminiClient).useValue(mockGeminiClient)
    .overrideProvider(GooglePlacesClient).useValue(mockGooglePlacesClient)
    .overrideProvider(OpenAiBatchClient).useValue(mockOpenAiBatchClient)
    .overrideProvider(S3Client).useValue(mockS3Client)
    .overrideProvider(DiscordWebhookClient).useValue(mockDiscordClient)
    .overrideProvider(GoogleOAuthClient).useValue(mockGoogleOAuthClient)
    .overrideProvider(KakaoOAuthClient).useValue(mockKakaoOAuthClient)
    .compile();

  app = module.createNestApplication();
  await app.init();
});
```

**왜 이 방식인가**:
- DTO가 바뀌었는데 프론트엔드가 모르는 상황을 잡음
- Guard가 실제로 요청을 막는지 확인됨
- mock으로 가려진 버그가 없음 (외부 API 제외)
- 배포 후 터지는 상황과 가장 유사한 환경

### 2.2 비즈니스 로직 Unit 테스트 (Backend 보조)

**역할**: 복잡한 계산, 변환, 분기 로직을 격리해서 빠르게 검증한다.

**대상 서비스** (이것만 Unit 테스트):

| 서비스 | 이유 |
|--------|------|
| MenuRecommendationService | Gemini 응답 파싱, JSON 복구, placeId 매칭 로직이 복잡 |
| PreferenceBatchService | 배치 결과 해석, 선호도 점수 계산 로직 |
| AuthService | 토큰 생성/검증, 만료 판단 로직 |
| AuthSocialService | OAuth 프로필을 User로 변환하는 매핑 로직 |
| GeminiPlacesService | 맛집 추천 결과 후처리, 매칭 로직 |
| AddressSearchService | 세션 토큰 관리, 결과 정규화 |
| PreferenceBatchScheduler | 배치 스케줄링, 실패 복구 로직 |

**검증 방식**: 행동(결과) 기반

```typescript
// 좋은 테스트: 결과를 검증한다
it('Gemini 응답에서 추천 목록을 파싱한다', () => {
  const rawResponse = loadFixture('gemini-recommendation-response.json');
  const result = service.parseRecommendations(rawResponse);

  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({
    name: expect.any(String),
    placeId: expect.any(String),
    reason: expect.any(String),
  });
});

// 나쁜 테스트: 내부 구현을 검증한다 (이렇게 하지 않는다)
it('파싱할 때 JSON.parse를 호출한다', () => {
  service.parseRecommendations(rawResponse);
  expect(JSON.parse).toHaveBeenCalled(); // 의미 없음
});
```

### 2.3 Guard/Pipe Unit 테스트 (Backend 보조)

**역할**: 보안과 입력 검증이 제대로 동작하는지 독립적으로 확인한다.

**대상**:

| 대상 | 테스트 내용 |
|------|-----------|
| JwtGuard | 유효한 토큰 통과, 만료된 토큰 차단, 토큰 없으면 차단 |
| RolesGuard | ADMIN만 접근 가능한 엔드포인트에 USER가 접근하면 차단 |
| FileValidationPipe | 허용 확장자/크기 초과 시 거부, 정상 파일 통과 |

---

## 3. Backend 테스트 전략

### 3.1 API 테스트 대상 (전체 Controller)

모든 엔드포인트에 대해 최소한 다음을 검증한다:

| Controller | 엔드포인트 수 | 검증 항목 |
|------------|-------------|----------|
| AuthController | 인증 관련 전체 | 회원가입/로그인/로그아웃/토큰 갱신/OAuth |
| MenuController | 메뉴 관련 전체 | 추천 요청/선택 저장/히스토리 조회 |
| UserController | 사용자 관련 전체 | 프로필 조회/수정/선호도 |
| UserPlaceController | 사용자 장소 전체 | 장소 등록/수정/삭제/사진 업로드 |
| RatingController | 평점 관련 전체 | 평점 등록/수정/조회 |
| BugReportController | 버그리포트 전체 | 리포트 생성/목록/상세 |
| NotificationController | 알림 관련 전체 | 알림 목록/읽음 처리 |
| Admin*Controller | 관리자 전체 | 일반 사용자 접근 차단 확인 |

**각 엔드포인트별 검증 체크리스트**:

```
[ ] 정상 요청 → 올바른 응답 (200/201)
[ ] 필수 필드 누락 → 400 에러 + 어떤 필드가 누락인지 메시지
[ ] 인증 안 된 요청 → 401 에러
[ ] 권한 없는 요청 → 403 에러 (Admin 엔드포인트)
[ ] 존재하지 않는 리소스 → 404 에러
[ ] 응답에 민감 정보(password, token 등) 미포함
```

### 3.2 비즈니스 로직 Unit 테스트 대상

복잡한 로직이 있는 서비스만 Unit 테스트한다. 단순 CRUD 서비스는 API 테스트에서 간접 커버된다.

**테스트 시나리오 예시**:

#### MenuRecommendationService
```
[ ] 정상 Gemini 응답 → 추천 목록 3개 반환
[ ] Gemini 응답 JSON이 잘린 경우 → 복구 후 파싱
[ ] placeId가 없는 추천 → nameLocal/nameKo/nameEn 순서로 매칭
[ ] Gemini API 실패 → 적절한 에러 throw
[ ] 빈 응답 → 빈 배열 반환
```

#### PreferenceBatchService
```
[ ] 배치 결과 정상 → 선호도 점수 업데이트
[ ] 배치 부분 실패 → 성공한 항목만 업데이트
[ ] 배치 전체 실패 → 에러 로깅 + 재시도 플래그
[ ] 결과 없는 사용자 → 건너뛰기
```

#### AuthService
```
[ ] 정상 로그인 → accessToken + refreshToken 반환
[ ] 비밀번호 불일치 → UnauthorizedException
[ ] refreshToken 만료 → 재로그인 요구
[ ] 탈퇴한 사용자 로그인 시도 → 적절한 에러
```

### 3.3 Guard/Pipe 테스트 대상

| 대상 | 시나리오 |
|------|---------|
| JwtGuard | 유효 토큰 통과, 만료 토큰 차단, 토큰 없음 차단, 잘못된 형식 차단 |
| RolesGuard | 역할 일치 통과, 역할 불일치 차단, 역할 미설정 시 기본 동작 |
| FileValidationPipe | 허용 확장자 통과, 비허용 확장자 거부, 크기 초과 거부, 파일 없음 처리 |

---

## 4. 외부 API 테스트 전략

PickEat은 8개의 외부 API에 의존한다. 테스트할 때 실제 API를 호출하지 않는다.

### 4.1 외부 API 목록과 테스트 방식

| 외부 API | 용도 | 테스트에서의 처리 |
|---------|------|----------------|
| Google Gemini | 맛집 추천 | fixture 기반 mock |
| Google Places | 주소 검색 | fixture 기반 mock |
| Google OAuth | 소셜 로그인 | fixture 기반 mock |
| Kakao OAuth | 소셜 로그인 | fixture 기반 mock |
| OpenAI Batch | 선호도 분석 | fixture 기반 mock |
| AWS S3 | 이미지 업로드 | mock (URL만 반환) |
| Discord Webhook | 버그 알림 | mock (호출 무시) |
| Google CSE | 블로그 검색 | fixture 기반 mock |

### 4.2 Fixture(응답 샘플) 관리

실제 외부 API 응답을 JSON 파일로 저장해두고, 테스트에서 이 파일을 사용한다.

```
test/fixtures/
  ├── gemini/
  │   ├── recommendation-success.json      # 정상 추천 응답
  │   ├── recommendation-truncated.json    # 잘린 JSON 응답
  │   └── recommendation-error.json        # 에러 응답
  ├── google-places/
  │   ├── autocomplete-success.json        # 자동완성 정상 응답
  │   ├── autocomplete-empty.json          # 결과 없음
  │   └── detail-success.json              # 장소 상세 정상 응답
  ├── google-oauth/
  │   └── profile-success.json             # 사용자 프로필
  ├── kakao-oauth/
  │   └── profile-success.json             # 사용자 프로필
  ├── google-cse/
  │   ├── search-success.json              # 블로그 검색 정상 응답
  │   └── search-empty.json                # 검색 결과 없음
  └── openai-batch/
      ├── batch-complete.json              # 배치 완료 응답
      └── batch-partial-failure.json       # 부분 실패 응답
```

**Fixture 작성 방법**:
1. 실제 API를 한 번 호출해서 응답을 받는다
2. 민감 정보(API 키, 실제 사용자 데이터)를 제거한다
3. JSON 파일로 저장한다
4. 외부 API 응답 형태가 바뀌면 fixture도 업데이트한다

**Fixture 기반 테스트 예시**:
```typescript
import geminiSuccess from '@test/fixtures/gemini/recommendation-success.json';
import geminiTruncated from '@test/fixtures/gemini/recommendation-truncated.json';

describe('GeminiPlacesService', () => {
  it('정상 응답에서 추천 목록을 추출한다', () => {
    mockGeminiClient.generate.mockResolvedValue(geminiSuccess);

    const result = await service.getRecommendations(user, query);

    expect(result).toHaveLength(3);
    expect(result[0].name).toBeDefined();
  });

  it('잘린 JSON 응답을 복구하여 파싱한다', () => {
    mockGeminiClient.generate.mockResolvedValue(geminiTruncated);

    const result = await service.getRecommendations(user, query);

    // 잘린 응답이지만 복구되어 결과 반환
    expect(result.length).toBeGreaterThan(0);
  });
});
```

### 4.3 Client 테스트

외부 API Client 자체도 fixture로 테스트한다. Client가 실제 HTTP 호출을 하는 부분은 mock하되, **응답을 파싱하는 로직**은 실제로 실행한다.

```typescript
describe('GooglePlacesClient', () => {
  it('Autocomplete 응답을 파싱하여 주소 목록을 반환한다', async () => {
    // HTTP 호출만 mock, 파싱 로직은 실제 실행
    mockHttpService.post.mockResolvedValue({
      data: loadFixture('google-places/autocomplete-success.json'),
    });

    const result = await client.autocomplete('강남역', sessionToken);

    expect(result).toHaveLength(5);
    expect(result[0]).toHaveProperty('placeId');
    expect(result[0]).toHaveProperty('description');
  });
});
```

### 4.4 외부 API 장애 시나리오

각 핵심 외부 API에 대해 장애 시나리오도 테스트한다:

| 시나리오 | 테스트 내용 |
|---------|-----------|
| API 타임아웃 | 재시도 후 실패 → 적절한 에러 반환 |
| 429 Rate Limit | 지수 백오프 재시도 동작 확인 |
| 500 서버 에러 | 재시도 후 실패 → 에러 로깅 확인 |
| 잘못된 응답 형태 | 파싱 실패 → 에러 throw (앱 죽지 않음) |
| 인증 만료 (401) | 적절한 에러 전파 |

---

## 5. 테스트 작성 규칙

### 5.1 행동을 테스트한다, 구현을 테스트하지 않는다

```typescript
// 좋음: 결과를 검증
expect(result.status).toBe('PENDING');
expect(result.recommendations).toHaveLength(3);
expect(response.status).toBe(201);

// 나쁨: 내부 호출을 검증
expect(mockRepository.save).toHaveBeenCalled();
expect(mockService.recommend).toHaveBeenCalledWith(prompt);
```

**예외**: 외부 API Client mock은 호출 여부 확인 허용 (실제 API를 안 부르는 게 중요하므로)

### 5.2 테스트 이름은 시나리오를 설명한다

```typescript
// 좋음: 읽으면 뭘 검증하는지 알 수 있음
it('필수 필드 없이 회원가입하면 400 에러를 반환한다')
it('만료된 토큰으로 접근하면 401 에러를 반환한다')
it('Gemini 응답 JSON이 잘린 경우 복구하여 파싱한다')

// 나쁨: 무슨 뜻인지 모름
it('should work')
it('register test')
it('handles error')
```

### 5.3 하나의 테스트는 하나의 시나리오

```typescript
// 좋음: 각 시나리오가 독립적
it('이메일 형식이 잘못되면 400 에러', ...)
it('비밀번호가 6자 미만이면 400 에러', ...)
it('이미 존재하는 이메일이면 409 에러', ...)

// 나쁨: 여러 시나리오를 하나에 몰아넣음
it('회원가입 검증 테스트', () => {
  // 이메일 검증도 하고...
  // 비밀번호 검증도 하고...
  // 중복 검증도 하고...
});
```

### 5.4 테스트 데이터는 Factory 사용

```typescript
// 좋음: Factory로 일관된 테스트 데이터
const user = UserFactory.create({ email: 'test@test.com' });
const menu = MenuRecommendationFactory.create({ userId: user.id });

// 나쁨: 테스트마다 하드코딩
const user = { id: 1, email: 'test@test.com', password: '...',  ... };
```

### 5.5 Mock은 최소한으로

- **Backend API 테스트**: 외부 API Client만 mock, 나머지는 실제 동작
- **Backend Unit 테스트**: 직접 의존하는 서비스만 mock

### 5.6 테스트 DB 격리 전략

API 테스트는 Docker PostgreSQL 테스트 DB를 사용한다.

**환경**:
- Docker 컨테이너: `postgres-test` (port 5433)
- DB: `pickeat_test`
- 설정: `dropSchema: true`, `synchronize: true` (테스트 시작 시 스키마 초기화)
- `.env.test`에 모든 테스트용 환경변수 정의

**격리 방식**: 테스트 파일 단위 격리

```typescript
// test/utils/api-test-setup.ts
beforeAll(async () => {
  // AppModule 부트스트랩 + 외부 API Client override
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GeminiClient).useValue(mockGeminiClient)
    .overrideProvider(GooglePlacesClient).useValue(mockGooglePlacesClient)
    // ... 나머지 외부 API Client override
    .compile();

  app = module.createNestApplication();
  await app.init();
  dataSource = app.get(DataSource);
});

// 각 테스트 전에 모든 테이블 초기화
beforeEach(async () => {
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(`TRUNCATE "${entity.tableName}" CASCADE`);
  }
});

afterAll(async () => {
  await app.close();
});
```

**인증 헬퍼**: API 테스트에서 인증이 필요한 요청을 위한 공통 함수

```typescript
// test/utils/auth-helper.ts
export async function createAuthenticatedUser(app: INestApplication) {
  // 1. 테스트 사용자 생성 (Factory 사용)
  // 2. 토큰 발급
  // 3. { user, accessToken } 반환
}
```

### 5.7 SSE 스트리밍 테스트 패턴

SSE 엔드포인트는 supertest의 기본 응답 버퍼링과 호환되지 않는다. 다음 패턴을 사용한다:

```typescript
it('POST /menu/recommend/stream — 정상 응답 시 result 이벤트를 반환한다', async () => {
  const events: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = request(app.getHttpServer())
      .post('/menu/recommend/stream')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prompt: '매운 음식' })
      .buffer(false)
      .parse((res, cb) => {
        res.on('data', (chunk: Buffer) => events.push(chunk.toString()));
        res.on('end', () => cb(null, events));
      });

    req.then(() => resolve()).catch(reject);
  });

  const resultEvent = events.find((e) => e.includes('"type":"result"'));
  expect(resultEvent).toBeDefined();
});
```

**주의: Mock은 즉시 resolve해야 한다.** SSE 스트림은 서비스 로직이 완료되어야 종료된다. 외부 API mock이 지연되면 스트림이 끝나지 않아 테스트가 타임아웃된다. 반드시 `mockResolvedValue`로 즉시 응답하도록 설정한다:

```typescript
// Good: 즉시 resolve → SSE 스트림이 바로 종료
mockGeminiClient.generate.mockResolvedValue(fixtureResponse);

// Bad: 실제 지연 시뮬레이션 → 테스트 타임아웃
mockGeminiClient.generate.mockImplementation(() => new Promise(r => setTimeout(r, 3000)));
```

SSE 클라이언트 연결 해제(abort) 동작은 supertest로 검증하기 어렵다. 이 부분은 서비스 Unit 테스트로 분리한다.

### 5.8 스케줄러 테스트

`@nestjs/schedule` 기반 스케줄러(PreferencesBatchScheduler 등)는 HTTP 요청으로 트리거되지 않으므로 API 테스트로 커버할 수 없다. Unit 테스트로 다음을 검증한다:

- 스케줄러 실행 조건 (advisory lock 획득 성공/실패)
- 배치 제출/결과 처리 로직
- 실패 시 재시도 로직
- 에러 발생 시 로깅 + 알림 (Discord)

---

## 6. 디렉토리 구조

```
pick-eat_be/
├── src/
│   └── {module}/
│       └── __tests__/                    # Unit 테스트 (co-located)
│           ├── {service}.spec.ts         # 비즈니스 로직 Unit
│           └── {guard|pipe}.spec.ts      # Guard/Pipe Unit
├── test/
│   ├── api/                              # API 테스트 (신규)
│   │   ├── auth.api.spec.ts
│   │   ├── menu.api.spec.ts
│   │   ├── user.api.spec.ts
│   │   ├── user-place.api.spec.ts
│   │   ├── rating.api.spec.ts
│   │   ├── bug-report.api.spec.ts
│   │   ├── notification.api.spec.ts
│   │   └── admin.api.spec.ts
│   ├── fixtures/                         # 외부 API 응답 샘플
│   │   ├── gemini/
│   │   ├── google-places/
│   │   ├── google-oauth/
│   │   ├── google-cse/
│   │   ├── kakao-oauth/
│   │   └── openai-batch/
│   ├── factories/                        # 테스트 데이터 팩토리
│   │   └── entity.factory.ts
│   ├── mocks/                            # 외부 API Client mock
│   │   ├── external-clients.mock.ts
│   │   └── repository.mock.ts
│   ├── utils/                            # 테스트 헬퍼
│   │   └── test-helpers.ts
│   └── jest-setup.ts                     # 전역 설정
└── jest.config.js
```

**네이밍 규칙**:
- API 테스트: `{도메인}.api.spec.ts`
- Unit 테스트: `{서비스명}.spec.ts`
- Fixture: `{api명}/{시나리오}.json`

---

## 7. 테스트 실행

```bash
# Unit 테스트 (src/**/__tests__/*.spec.ts)
pnpm test

# API 테스트 (test/api/*.api.spec.ts)
pnpm test:api

# 전체 테스트
pnpm test:all

# 커버리지
pnpm test:cov

# 특정 모듈만
pnpm test -- --testPathPattern=auth
```

### CI에서의 실행 순서

```
1. Backend Unit 테스트 (빠름, 30초)
2. Backend API 테스트 (중간, 2-3분)
```

실패 시 다음 단계로 넘어가지 않는다.

---

## 부록: 기존 테스트 처리 방침

기존 테스트는 **전부 삭제**하고 이 전략에 맞게 새로 작성한다.

**삭제 대상**:
- `pick-eat_be/src/*/__tests__/*.spec.ts` (96개 파일)

**유지 대상**:
- `pick-eat_be/test/` 인프라 (factories, mocks, utils, jest-setup.ts)

**이유**:
- 기존 테스트의 60%가 형식적 테스트 (의미 없는 검증)
- 전략 없이 작성되어 유지보수 비용만 높음
- 테스트 인프라(factory, mock, setup)는 잘 되어 있으므로 재활용
- 새 전략 기반으로 깨끗하게 시작하는 것이 효율적
