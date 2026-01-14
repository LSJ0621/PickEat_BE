# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based backend API for Pick-Eat, a restaurant menu recommendation platform that uses AI (GPT) to suggest personalized dining options based on user preferences and location.

**Tech Stack**: NestJS 11, TypeScript (ES2023), PostgreSQL 16, TypeORM, JWT authentication, OpenAI API, Google Places API, Kakao/Naver integrations, AWS S3.

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

### Menu Module Structure (Complex Example)

The menu module has a multi-layered service architecture:

```
menu/
├── services/                      # Core business logic
│   ├── menu-recommendation.service.ts
│   ├── menu-selection.service.ts
│   ├── openai-menu.service.ts     # OpenAI integration
│   ├── openai-places.service.ts   # Place recommendations via OpenAI
│   ├── place.service.ts           # Place data handling
│   └── two-stage-menu.service.ts  # Orchestration service
├── gpt/                           # GPT model-specific services
│   ├── base-menu.service.ts
│   ├── gpt4o-mini-validation.service.ts
│   └── gpt51-menu.service.ts
├── utilities/                     # Helper utilities
│   ├── menu-payload.util.ts
│   └── place-id.util.ts
└── preferences.scheduler.ts       # Cron-based scheduler
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
| Google | Places API, OAuth |
| Kakao | Login, address search |
| Naver | Maps, search |
| OpenAI | GPT recommendations (prompts in `src/external/openai/prompts/`) |

## Database Architecture

### Key Entities
- **User**: Unified model (email/password + OAuth), soft deletes, JSONB preferences, optimistic locking
- **UserAddress**: User addresses with default/search flags, soft deletes
- **MenuRecommendation**: AI-generated recommendations with reasoning
- **MenuSelection**: Daily menu choices (PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELLED)
- **PlaceRecommendation**: Google Places results
- **EmailVerification**: Time-limited codes (SIGNUP, RE_REGISTER, PASSWORD_RESET)
- **BugReport**: Bug reports with file uploads (UNCONFIRMED/CONFIRMED/FIXED/CLOSED)
- **BugReportNotification**: Bug report notification tracking for Discord webhooks

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
  - `PreferencesScheduler` (menu module) - User preference updates
  - `BugReportSchedulerService` (bug-report module) - Bug report processing
- **Email**: NestJS Mailer with Handlebars templates in `src/auth/templates/`
