## Pick-Eat 리팩토링 규칙 (실서비스 기준)

> 목표: 단순 “코드 정리”가 아니라 **실제 운영·확장·협업을 고려한 구조 개선**을 일관된 원칙 아래에서 수행한다.

---

### 1. 리팩토링의 기본 원칙

- **사용자 영향 우선**
  - 기능 동작과 외부 API 계약(요청/응답 스키마, 상태코드, 의미)이 바뀌는 변경은 “리팩토링”이 아니라 기능 변경으로 취급한다.
  - 리팩토링 PR에서는 가능한 한 **동일한 입력 → 동일한 출력**을 유지한다.
- **작고 독립적인 단계**
  - 파일 이동, 네이밍 변경, 함수 추출, 로직 분리 등은 **단계별로 쪼개서** 커밋/PR을 만든다.
  - “동작 변경”과 “형식 변경(formatting, import 정리)”을 한 PR에서 섞지 않는다.
- **테스트 기반 리팩토링**
  - 리팩토링 전에 최소한의 단위/통합 테스트를 추가하거나, 기존 테스트 케이스를 먼저 통과시키는지 확인한다.
  - 테스트 없는 영역을 리팩토링해야 한다면, 먼저 **행동을 고정하는 테스트(스냅샷/통합)** 를 추가한다.

---

### 2. 모듈 구조 & 의존성 정리

- **기본 원칙**
  - `src/{도메인}` 모듈(`menu`, `user`, `auth` 등)은 **컨트롤러, 서비스, 엔티티, DTO, 프롬프트, 스케줄러**가 한 폴더 안에서 자급자족하도록 유지한다.
  - 공통 유틸(`logger util`, `date util` 등)은 `src/common` 으로 분리하되, 도메인 의존성을 절대 가져오지 않는다.
- **의존성 방향**
  - “상위 레벨” 개념이 “하위 레벨”로만 의존하도록 한다.
    - 컨트롤러 → 서비스 → 리포지토리/엔티티 순서만 허용.
    - 서비스끼리 순환 의존성을 만들지 않는다. 필요하면 **도메인 서비스 → 응용 서비스 분리** 또는 이벤트/큐로 해소.
- **Nest 모듈 설계**
  - 각 모듈의 `providers`, `exports`, `imports`가 최소한이 되도록 조정한다.
  - 다른 모듈이 특정 서비스 하나만 필요할 때, **그 서비스만 export** 하고 전체 모듈을 재노출하지 않는다.

---

### 3. RESTful API 설계 원칙

- **리소스 중심 설계**
  - URL은 동사 대신 **명사(리소스)** 중심으로 설계한다.  
    - 예: `/menu/recommendations`, `/menu/selections`, `/user/preferences`
  - 상태 변경, 액션 이름이 필요하면 **HTTP 메서드와 쿼리/바디로 표현**하고,  
    정말 필요할 때만 서브 리소스/액션 엔드포인트를 사용한다.  
    - 예: `/menu/selections/{id}/cancel` 대신 `PATCH /menu/selections/{id}` + `cancel: true` 선호.
- **리소스 분리/통합 기준**
  - 하나의 리소스(컨트롤러/모듈)가 서로 다른 의미의 엔드포인트를 과도하게 많이 가지거나(예: 추천 + 통계 + 설정 등을 모두 포함),  
    URL 수준에서 명확히 다른 개념이 섞여 있다면 **새 리소스로 분리**하는 것을 우선 고려한다.
  - 반대로, 둘 이상의 리소스가 항상 함께 호출되고, 데이터 모델도 거의 동일하며,  
    클라이언트 입장에서 구분이 모호하다면 **단일 리소스로 통합**하는 것을 검토한다.
  - 리소스를 새로 만들 때는 폴더 구조(`src/{resource}`)와 Nest 모듈(`{Resource}Module`)도 함께 정리해,  
    “URL 리소스 ↔ 모듈/폴더”가 최대한 1:1로 대응되도록 한다.
- **HTTP 메서드 의미 통일**
  - `GET`: 조회 (부작용 없음), `POST`: 생성/명시적 액션, `PATCH`: 부분 수정, `DELETE`: 삭제/취소.
  - 같은 행위를 서로 다른 메서드로 중복 제공하지 않는다.
- **HTTP 상태코드 규칙**
  - 성공: `200 OK`(일반 조회/액션), `201 Created`(생성), `204 No Content`(본문 없는 성공)만 기본으로 사용.
  - 클라이언트 오류: `400/401/403/404/409` 등 의미가 분명한 코드만 사용하고,  
    서버 내부 오류는 `500`으로 통일하되 상세 메시지는 서버 로그에만 남긴다.
- **응답 스키마 일관성**
  - 리스트는 항상 `items`/`history`/`selections` 등 **복수형 배열 필드**로 감싸고, 메타 정보가 필요하면 최상위에서 함께 내려준다.
  - 에러 응답은 `{ code, message, details? }` 형태로 통일하고, Nest `ExceptionFilter` 기반으로 중앙에서 관리하는 것을 지향한다.

---

### 4. 서비스/비즈니스 로직 리팩토링

- **서비스 책임 분리**
  - 한 서비스 클래스의 public 메서드 수가 과도하게 많거나(10개 이상), 300줄을 넘기기 시작하면:
    - “서브 도메인 서비스”로 분리 (`MenuRecommendationService`, `MenuSelectionService` 등).
    - AI 호출, 데이터 저장, 매핑, 검증을 각각 Helper/Service로 나누는 것을 검토.
- **AI 연동 로직 패턴 통일**
  - OpenAI 호출은 모두 **전용 서비스(Base + 구체 구현)** 를 통해서만 이루어지도록 정리한다.
  - 공통 패턴:
    - `buildSystemPrompt()`, `buildUserPrompt()` → `prompts/` 로.
    - `response_format`, `schema`, `usage 로그` → Base 서비스에서 공통 처리.
    - 파싱/스키마 검증/에러 처리 로직을 중복 없이 공유.
- **에러 처리**
  - 도메인 오류(잘못된 상태, 권한 부족 등)는 `BadRequestException`, `ForbiddenException`, `NotFoundException` 등 **의미 있는 Nest HTTP 예외**로 통일.
  - 외부 시스템 오류(OpenAI, Kakao, Google 등)는 **서비스 내부에서 로깅 후 상위에 일반화된 예외 메시지**만 던진다.

---

### 5. DTO, Validation, 타입 정리

- **DTO 규칙**
  - 컨트롤러 입출력은 항상 DTO 클래스를 통과하도록 정리한다. (`any`, `object` 타입 금지)
  - `class-validator`, `class-transformer`를 적극 활용하고, **비즈니스 검증(도메인 규칙)** 과 단순 스키마 검증을 분리한다.
- **타입스크립트 타입**
  - `any` 제거를 리팩토링 TODO의 기본 항목으로 둔다.
  - 외부 응답 스키마(Kakao/Google/OpenAI)는 최소한의 interface를 정의해두고 사용.

---

### 6. AI 프롬프트 & 모델 관리

- **프롬프트 파일 규칙**
  - 모든 LLM 프롬프트는 `src/**/prompts/*.prompts.ts` 에 위치시킨다.
  - 프롬프트는 **시스템/유저/스키마**를 분리해 함수/상수로 정의하고, 비즈니스 코드에서 문자열 리터럴로 직접 작성하지 않는다.
- **모델/버전 관리**
  - LLM 모델명은 코드에 하드코딩하지 않고, 다음 우선순위로 관리:
    - 1) 기능별 전용 env (예: `OPENAI_MENU_MODEL`, `OPENAI_PREFERENCE_MODEL`)
    - 2) 공통 env (`OPENAI_MODEL`)
    - 3) 코드 기본값 (예: `'gpt-5.1'`)
  - 실제 사용 모델은 **로그에 항상 찍어** 디버깅 가능하게 한다.

---

### 7. 스케줄러 & 배치 로직

- **스케줄러 책임**
  - 스케줄러는 "대상 조회 + Job 단위로 위임 + 상태 갱신"에만 책임을 둔다.
  - 복잡한 비즈니스 로직(Lookup/LLM 호출/업데이트)은 전용 서비스 메서드로 캡슐화한다.
- **상태 머신 명확화**
  - 배치/재시도 로직에서 사용하는 상태(`PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELLED`)는 enum과 문서로 정의.
  - 상태 전이(어디서 어떤 상태로 바뀌는지)를 코드/문서에 명시하고, 중복 로직을 헬퍼/서비스로 통합한다.
- **재시도 정책(Retry Policy)**
  - 최대 재시도 횟수(`maxRetryCount`)를 명시하고, 초과 시 `CANCELLED` 또는 알림 처리한다.
  - 재시도 간격은 고정 또는 지수 백오프(exponential backoff)를 사용하고, 정책을 상수/설정으로 관리한다.
- **중복 로직 추출**
  - `processPendingSelections`와 `processFailedSelections` 등 유사 로직은 공통 private 메서드로 추출한다.
  - 예: `processSelections(selections, statusLabel)` 형태로 리팩토링.
- **Graceful Shutdown**
  - 스케줄러 실행 중 서버 종료 시 진행 중인 Job이 완료될 때까지 대기하거나, 안전하게 `IN_PROGRESS` → `PENDING`으로 롤백한다.
  - `@nestjs/terminus`의 헬스체크와 연동하거나, `onModuleDestroy` 훅에서 처리한다.

---

### 8. 로깅, 모니터링, 에러 핸들링

- **로깅 규칙**
  - 외부 API 호출(Kakao, Google, OpenAI)은 다음을 공통 형식으로 로그:
    - 요청 요약(타입, 대상, 주요 파라미터 일부)
    - 응답 상태/에러 코드
    - 소요 시간(ms)
  - 민감한 정보(API Key, 토큰, 개인 정보)는 마스킹하거나 로그에 남기지 않는다.
- **LLM 호출 로그**
  - 모델명, `usage` 토큰 수(prompt/completion/total), finish_reason을 로그로 남기고,
  - JSON 파싱 실패/스키마 검증 실패 시 **원본 content를 별도 레벨로 기록**한다(개인정보 여부 주의).
- **헬스체크 & 모니터링**
  - `@nestjs/terminus`를 사용해 `/health` 엔드포인트를 제공하고, DB 연결/외부 API 상태를 확인한다.
  - 스케줄러 실행 결과(성공/실패 건수, 소요 시간)를 집계 로그로 남긴다.

---

### 9. 환경 변수 & 설정 관리

- **`@nestjs/config` 필수 사용**
  - `dotenv` 단독 사용 대신 `@nestjs/config`의 `ConfigModule`/`ConfigService`를 사용한다.
  - **이유**: 테스트 시 `ConfigService`를 모킹하면 `process.env` 전역 객체를 건드리지 않아 테스트 간 독립성 보장.
- **`process.env` 직접 사용 금지**
  - 서비스/컨트롤러에서 `process.env.XXX`를 직접 참조하지 않는다.
  - 생성자에서 `ConfigService`를 주입받아 `this.config.get<T>('KEY')`로 접근한다.
  - 예외: `main.ts` 등 NestJS 컨텍스트 외부에서는 `process.env` 사용 가능 (주석으로 명시).
- **ConfigService 사용 패턴**
  ```typescript
  @Injectable()
  export class MyService {
    private readonly apiKey: string;
    
    constructor(private readonly config: ConfigService) {
      this.apiKey = this.config.get<string>('API_KEY', 'default-value');
    }
  }
  ```
- **환경별 설정 분리**
  - `.env.development`, `.env.production`, `.env.test` 등 환경별 파일로 분리한다.
  - `ConfigModule.forRoot({ envFilePath: \`.env.\${process.env.NODE_ENV}\` })`로 환경별 로드.
  - 절대 `.env` 파일이나 비밀값을 커밋하지 않는다 (`.env.example`만 커밋).
- **DB 접속 정보 하드코딩 금지**
  - `TypeOrmModule.forRoot()` 등에서 호스트, 포트, 사용자명, 비밀번호를 코드에 직접 작성하지 않는다.
  - `TypeOrmModule.forRootAsync()`와 `ConfigService`를 사용해 환경 변수에서 읽는다.
- **환경 변수 유효성 검증 (선택)**
  - 필수 환경 변수 누락 시 앱 시작을 막으려면 `Joi` 스키마 검증을 `ConfigModule`에 추가한다.
  - 예: `validationSchema: Joi.object({ DB_HOST: Joi.string().required() })`

---

### 10. 데이터베이스 & 트랜잭션

- **마이그레이션 규칙**
  - 프로덕션에서는 반드시 `synchronize: false`로 설정하고, TypeORM 마이그레이션(`migration:generate`, `migration:run`)을 사용한다.
  - 마이그레이션 파일은 `src/migrations/` 또는 `migrations/`에 버전 관리하며, 멱등성을 보장한다.
  - 스키마 변경 시 롤백 전략도 함께 문서화한다.
- **트랜잭션 처리**
  - 여러 엔티티를 함께 생성/수정하는 로직은 `QueryRunner` 또는 `@Transaction` 데코레이터를 사용해 원자성을 보장한다.
  - 스케줄러/배치에서 대량 처리 시, 청크 단위로 트랜잭션을 분리하거나 실패 시 부분 롤백 전략을 명시한다.
- **N+1 쿼리 방지**
  - 배치/리스트 API에서는 반드시 **쿼리빌더 또는 `join` 옵션**을 사용해 N+1을 제거한다.
  - `relations` 사용 시 실제로 필요한 관계만 명시적으로 불러온다.
- **인덱스/필터 정리**
  - 자주 사용하는 조회 조건(날짜별, user별)에는 DB 인덱스를 설계하고, 코드 주석에 의도 기록.
  - `selectedDate`, `status` 등 배치 조건 컬럼은 인덱스 후보로 둔다.

---

### 11. 테스트 전략 리팩토링

- **단위 테스트 우선순위**
  - 복잡한 비즈니스 로직, LLM 응답 파싱/검증, 상태 전이, 스케줄러용 서비스 메서드를 우선 테스트 대상으로 잡는다.
  - 외부 연동은 Mock(또는 TestDouble)으로 치환하고, "요청 형식/파싱 로직"에 집중한다.
- **ConfigService 모킹 패턴**
  - 테스트에서 환경 변수가 필요한 경우 `process.env`를 직접 조작하지 않고, `ConfigService`를 모킹한다.
  - 이렇게 하면 테스트 간 독립성이 보장되고 병렬 테스트가 안전해진다.
  ```typescript
  const module = await Test.createTestingModule({
    providers: [
      MyService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            const config = { OPENAI_API_KEY: 'test-key', DB_HOST: 'localhost' };
            return config[key];
          }),
        },
      },
    ],
  }).compile();
  ```
- **e2e 테스트**
  - 핵심 사용자 흐름:
    - 취향 입력 → 메뉴 추천 → 메뉴 선택 저장 → 스케줄러 실행(Mock LLM) → 취향 분석 갱신.
  - e2e는 "행동 보존" 확인용으로, 큰 리팩토링 전후의 회귀 테스트 역할을 한다.
  - e2e 테스트용 환경 파일은 `.env.test`로 분리하고, 테스트 DB를 사용한다.

---

### 12. 리팩토링 워크플로우

1. **문제/악취(코드 스멜) 정의**
   - 예: `menu.service.ts`가 너무 크다, LLM 호출 로직이 3군데 중복, 상태 전이가 여기저기 흩어져 있음 등.
2. **행동 고정 테스트 추가**
   - 변경 대상 함수/엔드포인트의 현재 동작을 테스트로 고정한다.
3. **구조 변경**
   - 파일/클래스 분리, 메서드 추출, 의존성 역전 등을 작은 단계로 나눠 적용.
4. **테스트/타입 확인**
   - `pnpm test`, `pnpm test:e2e`, `pnpm lint` 등을 통해 회귀 여부를 확인.
5. **임시 코드/디버그 흔적 정리 (머지 전 체크리스트)**
   - 테스트를 위해 잠시 비활성화했던 **AuthGuard, Interceptor, Pipe, Validation** 등을 원래 상태로 복구했는지 확인한다.
   - `console.log`, 초과 디버그 로그, 하드코딩된 토큰/이메일/ID, 임시 플래그(`isDevHack` 등)를 모두 제거하거나 정식 설정으로 치환한다.
   - Jest의 `.only`, `.skip`, 임시 Mock 강제 주입이 남아 있지 않은지 확인한다.
6. **문서/주석 업데이트**
   - 상태 머신, 스케줄러 주기, LLM 사용 규칙이 변경되면 관련 문서(예: 이 파일, README, prompts 문서)를 함께 갱신.

