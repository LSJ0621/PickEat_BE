# Pick-Eat 리팩토링 계획

> 작성일: 2024-12-04
> 기준 문서: [refactoring_rule.md](../rule/refactoring_rule.md)

---

## 📊 현재 코드베이스 분석 결과

### 발견된 주요 문제점

| 카테고리 | 문제 | 심각도 | 영향 범위 |
|----------|------|--------|----------|
| 환경 변수 | `process.env` 직접 사용 (29군데) | 🔴 높음 | 전체 |
| 환경 변수 | DB 설정 하드코딩 | 🔴 높음 | app.module.ts |
| 환경 변수 | CORS origin 하드코딩 | 🟡 중간 | main.ts |
| 서비스 크기 | menu.service.ts 1175줄 | 🔴 높음 | menu 모듈 |
| 코드 중복 | User/SocialLogin 분기 반복 | 🟡 중간 | menu, user 모듈 |
| 스케줄러 | 중복 로직, 재시도 정책 미정의 | 🟡 중간 | preferences.scheduler.ts |
| 타입 | `any` 타입 다수 사용 | 🟡 중간 | 전체 |

---

## 🎯 Phase 1: 환경 변수 & 설정 관리 (우선순위 최상)

> **목표**: `@nestjs/config` 도입으로 테스트 가능한 구조 만들기

### 1.1 패키지 설치 및 기본 설정

```bash
pnpm add @nestjs/config
```

**작업 내용**:
- [ ] `ConfigModule` 설치
- [ ] `.env` → `.env.development` 이름 변경
- [ ] `.env.production`, `.env.test`, `.env.example` 생성
- [ ] `.gitignore`에 `.env*` 추가 (example 제외)

**예상 소요**: 30분

---

### 1.2 app.module.ts 수정

**현재 문제**:
```typescript
// ❌ 하드코딩
TypeOrmModule.forRoot({
  host: 'localhost',
  password: 'postgres',
  synchronize: true,
})
```

**수정 후**:
```typescript
// ✅ ConfigService 사용
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
}),
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    host: config.get('DB_HOST'),
    port: config.get('DB_PORT'),
    // ...
  }),
}),
```

**예상 소요**: 30분

---

### 1.3 process.env 사용처 ConfigService로 마이그레이션

**영향 파일 (총 12개)**:

| 파일 | 환경 변수 | 우선순위 |
|------|----------|----------|
| `menu/menu.service.ts` | GOOGLE_API_KEY, GOOGLE_CSE_CX | 1 |
| `menu/openai-places.service.ts` | OPENAI_MODEL, OPENAI_API_KEY | 1 |
| `menu/gptversion/base-menu.service.ts` | OPENAI_API_KEY | 1 |
| `menu/gptversion/gpt51-menu.service.ts` | OPENAI_MENU_MODEL, OPENAI_MODEL | 1 |
| `user/preference-update-ai.service.ts` | OPENAI_* | 1 |
| `user/user.service.ts` | KAKAO_REST_API_KEY | 2 |
| `auth/auth.service.ts` | OAUTH_GOOGLE_*, JWT_* | 2 |
| `auth/auth.module.ts` | EMAIL_* | 2 |
| `auth/provider/jwt-token.provider.ts` | JWT_REFRESH_SECRET | 2 |
| `map/map.service.ts` | NAVER_MAP_*, GOOGLE_API_KEY | 3 |
| `search/search.service.ts` | NAVER_CLIENT_* | 3 |
| `main.ts` | PORT, CORS_ORIGIN | 3 |

**예상 소요**: 파일당 10~15분 → 총 2~3시간

---

### 1.4 main.ts CORS 설정 환경 변수화

**현재 문제**:
```typescript
// ❌ 하드코딩
app.enableCors({
  origin: 'http://localhost:8080',
});
```

**수정 후**:
```typescript
// ✅ 환경 변수
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
});
```

**예상 소요**: 10분

---

## 🎯 Phase 2: 서비스 분리 (menu.service.ts)

> **목표**: 1175줄 → 각 300줄 이하의 서비스로 분리

### 2.1 현재 menu.service.ts 책임 분석

| 책임 | 메서드 수 | 줄 수 (추정) |
|------|----------|--------------|
| 메뉴 추천 | 2 | ~90 |
| 메뉴 선택 CRUD | 8 | ~400 |
| 추천 이력 조회 | 4 | ~150 |
| Google Places 연동 | 6 | ~350 |
| 블로그 검색 | 1 | ~70 |
| 유틸리티 | 5 | ~100 |

### 2.2 분리 계획

```
menu/
├── menu.service.ts              # 컨트롤러 → 서비스 위임만
├── services/
│   ├── menu-recommendation.service.ts    # 메뉴 추천 로직
│   ├── menu-selection.service.ts         # 메뉴 선택 CRUD
│   ├── recommendation-history.service.ts # 이력 조회
│   └── google-places.service.ts          # Google API 연동
└── ...
```

**예상 소요**: 3~4시간

---

## 🎯 Phase 3: 코드 중복 제거

### 3.1 User/SocialLogin 분기 패턴 통합

**현재 문제**:
```typescript
// ❌ 거의 동일한 코드가 User용, SocialLogin용으로 2벌씩 존재
async recommendForUser(user: User, ...) { ... }
async recommendForSocialLogin(socialLogin: SocialLogin, ...) { ... }
```

**해결 방안**:
```typescript
// ✅ 공통 인터페이스 + 제네릭 또는 유니온 타입
type Owner = { type: 'user'; entity: User } | { type: 'social'; entity: SocialLogin };

async recommend(owner: Owner, prompt: string, ...) {
  const likes = owner.entity.preferences?.likes ?? [];
  // ...
}
```

**영향 범위**:
- `menu.service.ts`: recommend, createSelection, updateSelection, getHistory 등
- `menu.controller.ts`: 분기 로직

**예상 소요**: 2~3시간

---

### 3.2 preferences.scheduler.ts 중복 로직 추출

**현재 문제**:
```typescript
// ❌ processPendingSelections와 processFailedSelections가 90% 동일
@Cron('35 13 * * *')
async processPendingSelections() { ... }

@Cron('18 13 * * *')
async processFailedSelections() { ... }
```

**해결 방안**:
```typescript
// ✅ 공통 메서드 추출
private async processSelections(
  status: MenuSelectionStatus,
  label: string,
) {
  this.logger.log(`🕐 [스케줄러 실행] ${label} 건 처리 시작`);
  // ...
}

@Cron('35 13 * * *')
async processPendingSelections() {
  await this.processSelections(MenuSelectionStatus.PENDING, 'PENDING');
}
```

**예상 소요**: 1시간

---

## 🎯 Phase 4: 스케줄러 개선

### 4.1 재시도 정책 정의

**추가할 상수/설정**:
```typescript
// src/menu/constants/scheduler.constants.ts
export const SCHEDULER_CONFIG = {
  MAX_RETRY_COUNT: 3,
  BATCH_SIZE: 100,
  CRON_PENDING: '0 3 * * *',
  CRON_FAILED: '0 4 * * *',
};
```

**로직 추가**:
- `retryCount >= MAX_RETRY_COUNT` 시 `CANCELLED` 상태로 전환
- 실패 알림 로깅

**예상 소요**: 1시간

---

### 4.2 Graceful Shutdown 구현

```typescript
@Injectable()
export class PreferencesScheduler implements OnModuleDestroy {
  private isShuttingDown = false;

  async onModuleDestroy() {
    this.isShuttingDown = true;
    // IN_PROGRESS → PENDING 롤백 또는 완료 대기
  }
}
```

**예상 소요**: 1시간

---

## 🎯 Phase 5: 타입 개선

### 5.1 `any` 타입 제거 대상

| 파일 | 위치 | 현재 | 개선 |
|------|------|------|------|
| menu.service.ts | Google API 응답 | `any` | interface 정의 |
| base-menu.service.ts | usage 객체 | `any` | OpenAI 타입 사용 |
| preference-update-ai.service.ts | usage 객체 | `any` | OpenAI 타입 사용 |

**예상 소요**: 2시간

---

## 📅 실행 일정

| Phase | 작업 | 예상 소요 | 우선순위 |
|-------|------|----------|----------|
| **Phase 1** | 환경 변수 & ConfigService | 4~5시간 | 🔴 최우선 |
| **Phase 2** | menu.service.ts 분리 | 3~4시간 | 🟡 높음 |
| **Phase 3** | 코드 중복 제거 | 3~4시간 | 🟡 높음 |
| **Phase 4** | 스케줄러 개선 | 2시간 | 🟢 중간 |
| **Phase 5** | 타입 개선 | 2시간 | 🟢 중간 |

**총 예상 소요**: 14~17시간 (2~3일)

---

## ✅ 각 Phase 완료 체크리스트

### Phase 1 완료 조건
- [ ] `@nestjs/config` 설치 완료
- [ ] 환경별 `.env` 파일 생성
- [ ] 모든 `process.env` → `ConfigService` 변환
- [ ] `pnpm run lint` 통과
- [ ] 로컬 서버 정상 기동

### Phase 2 완료 조건
- [ ] menu.service.ts 300줄 이하
- [ ] 분리된 서비스 각각 단위 테스트 가능
- [ ] 기존 API 응답 동일 (회귀 테스트)

### Phase 3 완료 조건
- [ ] User/SocialLogin 분기 코드 1벌로 통합
- [ ] 스케줄러 중복 로직 제거
- [ ] 기능 동작 동일

### Phase 4 완료 조건
- [ ] 재시도 정책 상수화
- [ ] Graceful shutdown 구현
- [ ] 스케줄러 테스트 추가

### Phase 5 완료 조건
- [ ] `any` 타입 제거 (필수 영역)
- [ ] 외부 API 응답 interface 정의

---

## 📝 리팩토링 시 주의사항

1. **한 번에 하나씩**: 각 Phase를 완료하고 커밋한 후 다음 Phase 진행
2. **테스트 먼저**: 리팩토링 전 현재 동작을 테스트로 고정
3. **API 계약 유지**: 외부 응답 스키마 변경 금지
4. **점진적 마이그레이션**: process.env 변경 시 서비스별로 순차 진행

---

## 🔗 관련 문서

- [리팩토링 규칙](../rule/refactoring_rule.md)
- [프로젝트 README](../../README.md)

