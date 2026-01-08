# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based backend API for Pick-Eat, a restaurant menu recommendation platform that uses AI (GPT) to suggest personalized dining options based on user preferences and location.

**Tech Stack**: NestJS 11, TypeScript (ES2023), PostgreSQL 16, TypeORM, JWT authentication, OpenAI API, Google Places API, Kakao/Naver integrations, AWS S3, Prometheus/Grafana monitoring.

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
test/
├── e2e/                         # E2E tests (*.e2e-spec.ts)
├── integration/                 # Integration tests (*.integration.spec.ts)
├── fixtures/                    # Test fixtures
├── factories/entity.factory.ts  # Entity factories
├── mocks/                       # Mock implementations
│   ├── repository.mock.ts       # TypeORM mocking
│   └── external-clients.mock.ts # External API mocking
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
│   ├── controllers/         # Admin or specialized controllers
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

## Agent Workflow Guidelines

### Main Agent Role
- Minimize direct work, delegate to Custom Subagents
- Focus on judgment and coordination based on Subagent results
- Only handle: user communication, final decisions, planning

### Custom Subagent Execution
- **Model**: Always use `sonnet` for `.claude/agents/*.md` subagents
- **Available Subagents**:
  | Agent | Purpose |
  |-------|---------|
  | code-reviewer | Code quality review, architecture compliance |
  | test-code-writer | Unit/integration/E2E test writing |
  | code-quality-manager | Build/runtime/test error diagnosis and fixes |
  | prompt-engineer | AI prompt optimization |
  | api-documentation-manager | API documentation |

### Parallel Execution Strategy
- Same file modifications → Cannot be in same group
- Dependent tasks → Sequential execution
- Independent tasks → Parallel execution allowed

### Error Reporting
When Subagent work takes too long or errors persist:
1. Subagent → Report to Main Agent
2. Main Agent → Report to User with: issue, attempted solutions, recommended actions

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

## Path Aliases

TypeScript path alias `@/*` → `src/*`:
```typescript
import { AuthUserPayload } from '@/auth/interfaces/auth-user-payload.interface';
```

## Additional Notes

- **AI Prompts**: Located in `src/external/openai/prompts/` (menu-recommendation, menu-validation, preference-update, google-places-recommendation)
- **Scheduled Tasks**: Uses `@nestjs/schedule` with `@Cron()` decorators (e.g., `PreferencesScheduler`)
- **Email**: NestJS Mailer with Handlebars templates in `src/auth/templates/`
