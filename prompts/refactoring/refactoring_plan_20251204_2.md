## Pick-Eat 리소스별 폴더링 리팩토링 계획 (2025-12-04)

> 목표: 리소스(도메인) 기준으로 폴더 구조를 정리해서 **읽기 쉽고, 확장 가능하고, 테스트/리팩토링이 쉬운 구조**로 만든다.

---

## 1. 상위 구조 원칙

### 1.1 최상위 디렉터리 규칙

- **`src/{resource}` = 하나의 도메인/리소스**
  - 예: `auth`, `user`, `menu`, `search`, `map`, (추후) `common`, `external` 등
- 각 리소스 디렉터리는 다음 공통 서브 폴더 규칙을 따른다:
  - `controller/` – 컨트롤러들 (`*.controller.ts`)
  - `services/` – 도메인 서비스, 응용 서비스
  - `entities/` – TypeORM 엔티티
  - `dto/` – 요청/응답 DTO
  - `prompts/` – LLM 프롬프트 모음
  - `scheduler/` – 해당 도메인 배치/크론 잡
  - `interfaces/`, `types/`, `enum/` – 타입 정의
  - `gpt/` 또는 `llm/` – LLM 버전/전략 클래스들

### 1.2 공통/인프라 레벨 분리

- `src/common/`
  - 공통 유틸리티 (`date`, `logger`, `pagination`, `error` 등)
  - 공용 데코레이터, 가드, 인터셉터, 필터 (도메인 의존성 없는 것만)
- `src/external/`
  - 외부 API 클라이언트 래퍼 (Naver, Kakao, Google, OpenAI 등)
  - 역할: HTTP 호출 + 응답 타입 정의 + 에러 매핑 (비즈니스 로직 없음)

---

## 2. 리소스별 목표 구조 및 이동 계획

### 2.1 Auth 리소스 (`src/auth`)

#### 목표 구조

```text
src/auth/
  auth.module.ts
  controller/
    auth.controller.ts
  services/
    auth.service.ts
    email-verification.service.ts
  dto/
    *.dto.ts
  entities/
    email-verification.entity.ts
  guard/
    jwt.guard.ts
    local.guard.ts
  strategy/
    jwt.strategy.ts
  provider/
    jwt-token.provider.ts
  templates/
    email-verification.hbs
```

#### 작업 계획
- [ ] `auth.controller.ts` → `auth/controller/` 이동 (import 경로 정리)
- [ ] `auth.service.ts`, `services/email-verification.service.ts` → `auth/services/`
- [ ] 테스트 파일(`auth.controller.spec.ts`, `auth.service.spec.ts`)도 동일 폴더 규칙으로 이동 및 import 수정

---

### 2.2 User 리소스 (`src/user`)

#### 목표 구조

```text
src/user/
  user.module.ts
  controller/
    user.controller.ts
  services/
    user.service.ts
    preference-update-ai.service.ts
  dto/
    *.dto.ts
  entities/
    user.entity.ts
    social-login.entity.ts
  enum/
    social-type.enum.ts
  interfaces/
    address-search-result.interface.ts
    kakao-local.interface.ts
    user-preferences.interface.ts
  prompts/
    preference-update.prompts.ts
```

#### 작업 계획
- [ ] `user.controller.ts` → `user/controller/` 이동
- [ ] `user.service.ts`, `preference-update-ai.service.ts` → `user/services/`
- [ ] `user.controller.spec.ts`, `user.service.spec.ts` 위치 및 import 경로 정리

---

### 2.3 Menu 리소스 (`src/menu`)

#### 목표 구조 (1차: 폴더링 관점)

```text
src/menu/
  menu.module.ts
  controller/
    menu.controller.ts
  services/
    menu.service.ts                      # 1차: 기존 로직 유지, 이후 쪼개기
    menu-recommendation.service.ts       # 2차: 메뉴 추천 전용
    menu-selection.service.ts            # 2차: 메뉴 선택/취소/이력 생성
    menu-history.service.ts              # 2차: 추천/선택 이력 조회
    menu-place-recommendation.service.ts # 2차: Google Places + LLM
  scheduler/
    preferences.scheduler.ts
  entities/
    menu-recommendation.entity.ts
    menu-selection.entity.ts
    place-recommendation.entity.ts
  dto/
    *.dto.ts
  prompts/
    menu-recommendation.prompts.ts
    google-places-recommendation.prompts.ts
  gpt/
    base-menu.service.ts
    gpt51-menu.service.ts
    openai-menu.service.ts
    openai-places.service.ts
  utils/
    menu-payload.util.ts
  types/
    menu-selection.types.ts
```

#### 작업 계획
**1단계: 디렉터리 생성 + 파일 이동만 (행동 보존)**
- [ ] `menu.controller.ts` → `menu/controller/`
- [ ] `preferences.scheduler.ts` → `menu/scheduler/`
- [ ] `gptversion/*`, `openai-menu.service.ts`, `openai-places.service.ts` → `menu/gpt/`
- [ ] `menu-payload.util.ts` → `menu/utils/`

**2단계: 서비스 책임 분리 (별도 리팩토링 Phase)**
- [ ] `menu.service.ts` 내부 책임을 3~4개의 서비스로 분리하고, `MenuService`는 Facade 역할만 남김
- [ ] 컨트롤러는 `MenuService`를 통해서만 도메인 기능 호출

---

### 2.4 Search 리소스 (`src/search`)

#### 목표 구조

```text
src/search/
  search.module.ts
  controller/
    search.controller.ts
  services/
    search.service.ts
  dto/
    search-restaurants.dto.ts
```

#### 작업 계획
- [ ] `search.controller.ts` → `search/controller/`
- [ ] `search.service.ts` → `search/services/`
- [ ] `search.controller.spec.ts`, `search.service.spec.ts` 위치/경로 정리

---

### 2.5 Map 리소스 (`src/map`)

#### 목표 구조

```text
src/map/
  map.module.ts
  controller/
    map.controller.ts
  services/
    map.service.ts
  interfaces/
    map.interface.ts
    naver-reverse-geocode.interface.ts
```

#### 작업 계획
- [ ] `map.controller.ts` → `map/controller/`
- [ ] `map.service.ts` → `map/services/`
- [ ] `map.controller.spec.ts`, `map.service.spec.ts` 위치/경로 정리

---

## 3. 공통/외부 리소스 구조 (2차 단계)

### 3.1 Common 레이어 (`src/common`)

#### 목표
- 도메인에 의존하지 않는 공통 컴포넌트만 모은다.

```text
src/common/
  decorators/
  guards/
  interceptors/
  filters/
  utils/
    date.util.ts
    logger.util.ts
    pagination.util.ts
```

#### 작업 계획
- [ ] 현재 도메인에 강하게 의존하지 않는 유틸/데코레이터 후보 식별
- [ ] 하나씩 `common/`으로 이동하며 import 경로 정리

### 3.2 External API 클라이언트 (`src/external`)

#### 목표
- Kakao, Naver, Google 같은 외부 HTTP 호출을 도메인에서 분리.

```text
src/external/
  kakao/
    kakao-local.client.ts
  naver/
    naver-search.client.ts
    naver-map.client.ts
  google/
    google-places.client.ts
  openai/
    openai.client.ts        # (옵션)
```

#### 작업 계획 (후순위)
- [ ] 현재 `user.service.ts`, `search.service.ts`, `map.service.ts`, `menu.service.ts` 내부의 HTTP 호출 위치 파악
- [ ] 외부 API 호출 부분만 thin client로 추출 (타입 정의 + 에러 매핑)
- [ ] 각 도메인 서비스는 external client를 주입받아 사용

---

## 4. 테스트 파일 구조 정렬

### 4.1 규칙

- 각 리소스 내부에 테스트를 최대한 인접하게 둔다:
  - `src/auth/controller/auth.controller.spec.ts`
  - `src/auth/services/auth.service.spec.ts`
  - `src/user/controller/user.controller.spec.ts`
  - `src/user/services/user.service.spec.ts`

### 4.2 작업 계획

- [ ] 컨트롤러/서비스 파일을 새 폴더로 이동할 때, 대응되는 `*.spec.ts`도 함께 이동
- [ ] Jest 설정에서 루트(`src`) 기준으로 테스트를 찾을 수 있는지 확인 (필요 시 glob 수정)

---

## 5. 적용 순서 요약

1. **폴더 구조만 먼저 만들기**
   - 각 리소스에 `controller/`, `services/`, `scheduler/`, `gpt/`, `utils/` 디렉터리 생성
   - 파일 이동 + import 경로 수정 후 `pnpm run build`, `pnpm test`로 회귀 확인
2. **서비스 분리/외부 클라이언트 추출은 별도 Phase로**
   - 특히 `menu.service.ts`는 기능 단위로 테스트를 추가해가며 점진적으로 쪼갬
3. **마지막에 문서/README 업데이트**
   - 실제 적용된 폴더 구조를 `refactoring_rule.md` 및 README에 반영

---

## 6. 완료 체크리스트

- [ ] `src/{auth,user,menu,search,map}` 모든 리소스에 `controller/`, `services/` 디렉터리가 존재한다.
- [ ] LLM 관련 파일이 각 도메인의 `gpt/` 아래로 정리되었다.
- [ ] 스케줄러 파일이 각 도메인의 `scheduler/` 아래에 위치한다.
- [ ] 이메일(SMTP), OpenAI, Naver, Kakao 등의 키는 모두 `ConfigService`로만 접근한다.
- [ ] 테스트 파일이 새로운 디렉터리 구조를 따라가며, Jest가 모두 통과한다.
