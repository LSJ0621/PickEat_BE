# 저장소 가이드라인

## 프로젝트 구조 & 모듈 구성
애플리케이션 코드는 `src/` 디렉토리에 있으며, Nest 모듈(`auth/`, `user/`)로 구성되어 컨트롤러, 서비스, DTO, 가드가 함께 위치하여 빠른 소유권 파악이 가능합니다. `main.ts`는 HTTP 서버를 부트스트랩하고, `app.module.ts`는 `.env`를 통해 로드된 프로바이더와 데이터베이스 설정을 연결합니다. 통합 테스트 자산(`test/`)은 e2e 스펙과 `test/jest-e2e.json`을 포함하며, 컴파일된 출력은 `dist/`에 저장되며 수동으로 편집해서는 안 됩니다.

## 빌드, 테스트 및 개발 명령어
- `pnpm install` – 의존성 설치; 브랜치 전환 후 실행.
- `pnpm run start:dev` – 라이브 리로드가 있는 감시 모드; `pnpm run start`는 단일 컴파일, `pnpm run start:prod`는 `node dist/main` 실행.
- `pnpm run build` – `dist/`에 프로덕션 번들 생성.
- `pnpm run lint` / `pnpm run format` – `src/`와 `test/`에 ESLint + Prettier 적용.
- `pnpm run test`, `pnpm run test:e2e`, `pnpm run test:cov` – 각각 유닛, e2e, 커버리지 테스트 실행.

## 코딩 스타일 & 네이밍 규칙
Prettier + ESLint로 강제되는 2칸 들여쓰기와 작은따옴표를 사용하는 TypeScript를 사용하며, 푸시 전에 floating promises나 unsafe arguments에 대한 lint 경고를 수정하세요. 클래스, 컨트롤러, 서비스, DTO는 `PascalCase`를 사용하고, 변수와 헬퍼는 `camelCase`를 사용합니다. DTO는 `Dto`로, 가드는 `Guard`로, 프로바이더는 `Provider`로 접미사를 붙이고, 주입된 서비스는 `private readonly`로 표시하세요.

## 테스트 가이드라인
유닛 스펙은 구현 파일 옆에 `*.spec.ts`로 배치하고 `pnpm run test`로 실행하세요. E2E 스위트는 `test/` 디렉토리에 있으며 `test/jest-e2e.json`에 의존합니다. HTTP 계약, 가드, 또는 데이터베이스 흐름이 변경될 때마다 `pnpm run test:e2e`를 실행하세요. `pnpm run test:cov`를 통해 ≥80% 커버리지를 목표로 하며 PR에서 누락된 부분을 설명하세요.

## 커밋 & Pull Request 가이드라인
커밋은 작고, 소문자이며, 명령형으로 작성하세요—기존 `first` 메시지를 따르거나 `auth: add refresh token`과 같은 `scope: action` 형식을 선호하세요. 각 PR에는 요약, 연결된 이슈, env 또는 마이그레이션 노트, 실행한 명령어 스택(`pnpm run lint && pnpm run test && pnpm run test:e2e`)이 포함되어야 합니다. 응답 페이로드가 변경될 때마다 스크린샷이나 샘플 curl 호출을 추가하세요.

## 보안 & 설정 팁
`.env.example`을 `.env`로 복사하고, 비밀을 커밋하지 말며, `docker-compose up -d postgres`로 로컬에서 Postgres를 시작하세요. TypeORM 엔티티를 추가할 때는 스키마 영향 사항을 문서화하고 마이그레이션이 멱등성을 보장하도록 하세요. `class-validator` 데코레이터로 인바운드 DTO를 검증하고, 응답을 반환하거나 에러를 로깅하기 전에 민감한 필드를 제거하세요.
