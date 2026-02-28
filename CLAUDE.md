# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based backend API for Pick-Eat, a restaurant menu recommendation platform that uses AI (GPT) to suggest personalized dining options based on user preferences and location.

**Tech Stack**: NestJS 11, TypeScript (ES2023), PostgreSQL 16, TypeORM, JWT authentication, OpenAI API, Google Places API, Kakao OAuth, AWS S3.

## Development Commands

```bash
pnpm run start:dev      # Development watch mode
pnpm run build          # Compile TypeScript
pnpm run lint           # ESLint with auto-fix
pnpm run test           # Unit tests
pnpm run test:e2e       # E2E tests
```

## Testing Structure

```
src/{module}/__tests__/          # Unit tests (co-located)
src/external/mocks/              # Mock implementations for external APIs (used in tests)
test/
├── e2e/                         # E2E tests (*.e2e-spec.ts)
├── integration/                 # Integration tests (*.integration.spec.ts)
├── fixtures/                    # Test fixtures
├── factories/entity.factory.ts  # Entity factories
├── mocks/                       # Mock implementations
│   ├── repository.mock.ts       # TypeORM mocking
│   ├── external-clients.mock.ts # External API mocking
│   └── openai.mock.ts           # OpenAI mocking
├── constants/                   # Test constants
└── utils/                       # Test utilities
```

## Architecture Principles

### Layer Separation
**Controller** (request/response) → **Service** (business logic, max 500 lines) → **Repository** (TypeORM) / **Client** (external APIs)

### Core Rules
- **Service size limit**: Keep services under 500 lines. Split by responsibility if exceeded.
- **No duplication**: Reuse existing utilities. Extract common logic into shared functions.
- **Constants over magic values**: Use constants from `src/common/constants/`.
- **Logger only**: Never use `console.log`. Always use NestJS Logger.
- **Global exception handling**: All errors handled by `src/common/filters/http-exception.filter.ts`.
- **Immediate cleanup**: Delete unused imports/functions/variables after any modification.
- **Code migration**: When moving code, delete original OR update to call new location.
- **Never use `any` type**: Use explicit types or interfaces.
- **Services only throw exceptions**: Never format responses in services.

## File Structure Conventions

```
src/
├── {feature}/
│   ├── __tests__/           # Unit tests (*.spec.ts)
│   ├── controllers/         # Admin or specialized controllers (e.g., admin-bug-report.controller.ts)
│   ├── dto/                 # {operation}-{feature}.dto.ts
│   ├── entities/            # {feature}.entity.ts
│   ├── interfaces/          # Response types (*.interface.ts)
│   ├── services/            # {feature}.service.ts
│   ├── {feature}.controller.ts
│   └── {feature}.module.ts
│
├── external/                # External API integrations
│   └── {provider}/
│       ├── {provider}.constants.ts
│       ├── {provider}.types.ts
│       └── clients/{name}.client.ts
│
└── common/                  # Shared infrastructure
    ├── config/, constants/, exceptions/
    ├── filters/, interceptors/, interfaces/, utils/
```

### Standard Module Template

All modules follow this unified structure:

```
src/{feature}/
├── __tests__/              # ALL test files here (never next to source)
│   ├── {feature}.service.spec.ts
│   └── services/           # Sub-service tests
├── controllers/            # Admin or specialized controllers
├── dto/                    # {operation}-{feature}.dto.ts
├── entities/               # {feature}.entity.ts
├── interfaces/             # Response types (*.interface.ts) — always plural
├── services/               # ALL services here (no sub-directories like gpt/)
├── utils/                  # Utility files (not utilities/)
├── {feature}.controller.ts
├── {feature}.module.ts
└── {feature}.service.ts
```

**Naming rules**:
- Interfaces directory: `interfaces/` (plural, never `interface/`)
- Utils directory: `utils/` (never `utilities/`)
- All services in `services/` (no separate `gpt/` or similar sub-directories)
- Tests always in `__tests__/` (never next to source files)

### Menu Module Structure (Complex Example)

The menu module has a multi-layered service architecture:

```
menu/
├── services/                      # ALL services unified here
│   ├── base-menu.service.ts       # GPT base service
│   ├── gpt4o-mini-validation.service.ts
│   ├── gpt51-menu.service.ts
│   ├── gpt-web-search-menu.service.ts
│   ├── web-search-summary.service.ts
│   ├── menu-recommendation.service.ts
│   ├── menu-selection.service.ts
│   ├── openai-menu.service.ts     # OpenAI integration
│   ├── openai-places.service.ts   # Place recommendations via OpenAI
│   ├── place.service.ts           # Place data handling
│   └── two-stage-menu.service.ts  # Orchestration service
├── interfaces/                    # Unified (singular interface/ merged here)
├── utils/                         # Unified (utilities/ + root utils merged here)
│   ├── menu-payload.util.ts
│   ├── place-id.util.ts
│   └── menu-selection-state-machine.ts
└── __tests__/
    ├── services/                  # All service tests
    └── utils/                     # Utility tests
```

### Auth Module Structure (Split Services)

```
auth/
├── auth.service.ts                # Core auth (~200 lines): register, login, logout, refresh
├── services/
│   ├── auth-social.service.ts     # OAuth/social login (Kakao, Google)
│   ├── auth-password.service.ts   # Password reset flow
│   ├── auth-token.service.ts      # JWT token management
│   ├── email-notification.service.ts
│   └── email-verification.service.ts
├── templates/                     # Handlebars email templates (hyphen-separator: *-en.hbs, *-ko.hbs)
└── __tests__/
```

## Plan Mode Guide

### Use Plan Mode (EnterPlanMode)
- New feature implementation (2+ files expected)
- Architecture decisions needed
- Large-scale refactoring
- Multiple valid approaches to choose from

### Proceed Directly
- Simple bug fixes (1-2 files)
- Small additions following existing patterns
- Documentation updates

## External API Integration

### File Structure
Each provider has: `{provider}.constants.ts` (URLs, versions), `{provider}.types.ts` (response types), `clients/{name}.client.ts` (API calls)

### Configuration Values are Validated (CRITICAL!)
`BASE_URL`, `ENDPOINTS`, authentication headers in `src/external/**/*.constants.ts` are **verified values**.
- **Do NOT modify during refactoring**
- Changes require: official documentation verification + separate task + documented reasoning

### Current Integrations
| Provider | Description |
|----------|-------------|
| AWS S3 | File uploads |
| Discord | Bug report webhooks |
| Gemini | Place recommendations via Google AI |
| Google | Places API, OAuth, Search |
| Kakao | OAuth login |
| OpenAI | GPT recommendations (prompts in `src/external/openai/prompts/`) |

## Database Architecture

### Key Entities
- **User**: Unified model (email/password + OAuth), soft deletes, JSONB preferences, optimistic locking
- **UserAddress**: User addresses with default/search flags, soft deletes
- **MenuRecommendation**: AI-generated recommendations with reasoning
- **MenuSelection**: Daily menu choices (PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELLED)
- **PlaceRecommendation**: Google Places results
- **EmailVerification**: Time-limited codes (SIGNUP, RE_REGISTER, PASSWORD_RESET)
- **BugReport**: Bug reports with file uploads (UNCONFIRMED/CONFIRMED/FIXED), immediate Discord notification on creation

## Path Aliases

TypeScript path alias `@/*` → `src/*`:
```typescript
import { AuthUserPayload } from '@/auth/interfaces/auth-user-payload.interface';
```

## Quality Checklist & Workflow

### Before Writing Code

- Check existing utilities in `src/common/`
- Check existing services in related modules
- Check existing external clients in `src/external/`
- Reuse existing code when possible

### While Writing Code

- Follow layer separation (Controller → Service → Repository/Client)
- Use TypeScript properly (no `any`, explicit types)
- Keep services under 500 lines (split if larger)
- Use NestJS Logger (never `console.log`)
- Use constants from `src/common/constants/`

### After Writing Code (Every Phase)

- `pnpm run build` must succeed
- Zero TypeScript/ESLint errors
- Remove ALL unused imports/variables/functions
- Run relevant tests
- Verify documentation matches implementation

**NEVER** proceed to next phase if any item fails. Fix and re-verify first.

### Refactoring Priority

1. Remove duplicate code (extract common functions, delete originals completely)
2. Split services over 500 lines
3. Remove unused code
4. Replace `any` types
5. Move hardcoded values to constants

**Refactoring Rules:**
- One module/feature at a time
- NEVER refactor while adding features
- When moving code, delete original OR update to call new location
- Original code must be completely deleted when extracted

## Additional Notes

- **AI Prompts**: Located in `src/external/openai/prompts/` (menu-recommendation, menu-validation, preference-update, google-places-recommendation)
- **Scheduled Tasks**: Uses `@nestjs/schedule` with `@Cron()` decorators
  - `BatchSchedulerService` (batch module) - OpenAI Batch API operations for menu recommendations
  - `NotificationSchedulerService` (notification module) - Notification delivery
  - `RatingSchedulerService` (rating/services/) - Place rating updates
- **Email**: NestJS Mailer with Handlebars templates in `src/auth/templates/`

---

## Quick Start Templates

### 새 Controller 엔드포인트
```typescript
@Post('new-endpoint')
async newEndpoint(
  @Body() dto: CreateDto,
  @CurrentUser() authUser: AuthUserPayload,
) {
  const user = await this.service.getAuthenticatedEntity(authUser.email);
  return this.service.newMethod(user, dto);
}
```

### 새 Service 메소드
```typescript
async newMethod(user: User, dto: CreateDto): Promise<ResultType> {
  // 비즈니스 로직
  return result;
}
```

### 새 DTO
```typescript
// src/{module}/dto/{operation}-{module}.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class CreateSomethingDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

---

## File Creation Checklist

- [ ] 올바른 모듈 디렉토리
- [ ] DTO validation decorators
- [ ] Module에 provider 등록
- [ ] @/ 경로 alias 사용
- [ ] Logger 사용 (console.log 금지)
- [ ] `pnpm run build` 성공

---

## Mandatory Agent Usage

pick-eat_be/ 작업 시 반드시 아래 에이전트를 사용하세요:
- **test-code-writer**: 테스트 코드 작성 시
- **code-reviewer**: 코드 변경 완료 후 필수
- **code-quality-manager**: 빌드/테스트 에러 발생 시
- **api-sync-analyzer**: controller, DTO, endpoints 변경 후
- **api-documentation-manager**: API 변경 확인 후 문서화
- **prompt-engineer**: src/external/openai/prompts/ 파일 수정 시
- **refactor-executor**: 리팩토링 작업 (3+ 파일)
