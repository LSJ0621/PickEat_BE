# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based backend API for Pick-Eat, a restaurant menu recommendation platform that uses AI (GPT) to suggest personalized dining options based on user preferences and location.

**Tech Stack**: NestJS 11, TypeScript (ES2023), PostgreSQL 16, TypeORM, JWT authentication, OpenAI API, Google Places API, Kakao/Naver integrations, AWS S3, Prometheus/Grafana monitoring.

## Development Commands

```bash
# Development
pnpm run start:dev          # Watch mode (NODE_ENV=development)
pnpm run start:debug        # Debug mode with inspector

# Build and Production
pnpm run build              # Compile TypeScript
pnpm run start:prod         # Production mode

# Code Quality
pnpm run lint               # ESLint with auto-fix
pnpm run format             # Prettier formatting

# Testing
pnpm run test               # Unit tests (NODE_ENV=test)
pnpm run test:watch         # Watch mode
pnpm run test:cov           # Coverage report
pnpm run test:e2e           # E2E tests

# Infrastructure
docker-compose up -d postgres    # Start PostgreSQL 16
docker-compose up -d prometheus  # Metrics collection (port 9090)
docker-compose up -d grafana     # Dashboards (port 3001)
```

## Architecture Principles

### Layer Separation
**Controller** (request/response) → **Service** (business logic, max 500 lines) → **Repository** (TypeORM) / **Client** (external APIs)

### Core Rules
- **Service size limit**: Keep services under 500 lines. If exceeded, split by responsibility and delegate external API calls to dedicated Clients in `src/external/`.
- **No duplication**: Reuse existing utilities/functions. Extract common logic into shared functions.
- **Constants over magic values**: Never use magic numbers/strings. Use constants from `src/common/constants/`.
- **Logger only**: Never use `console.log`. Always use NestJS Logger.
- **Global exception handling**: All errors must be handled by the global ExceptionFilter in `src/common/filters/http-exception.filter.ts`.
- **Immediate cleanup**: After any modification, immediately delete unused imports/functions/variables/endpoints/DTOs.
- **Code migration**: When moving code, either delete the original OR update it to call the new location. Moving alone is incomplete.
- **Integration cleanup**: When adding a unified method, immediately delete the old ones.

### File Structure Conventions

```
src/
├── {feature}/
│   ├── controllers/         # HTTP layer (admin or specialized controllers)
│   ├── dto/                 # {operation}-{feature}.dto.ts
│   ├── entities/            # {feature}.entity.ts
│   ├── interfaces/          # Response types, complex types (*.interface.ts)
│   ├── services/            # {feature}.service.ts, {feature}-{operation}.service.ts
│   ├── {feature}.controller.ts
│   └── {feature}.module.ts
│
├── external/                # External API integrations
│   └── {provider}/
│       ├── {provider}.constants.ts   # URLs, versions, constants
│       ├── {provider}.types.ts       # Response type definitions
│       └── clients/
│           └── {name}.client.ts      # API call implementations
│
└── common/                  # Shared infrastructure
    ├── config/              # Configuration modules
    ├── constants/           # Business constants
    ├── exceptions/          # Custom exception classes
    ├── filters/             # Global exception filters
    ├── interceptors/        # Global interceptors
    ├── interfaces/          # Shared interfaces
    └── utils/               # Utility functions
```

## DTOs, Entities, and Interfaces

### Interface Separation Rule
**Never define interfaces directly in services/controllers.** Always separate into dedicated files:
- Response types → `{module}/interfaces/{name}.interface.ts`
- External API responses → `external/{provider}/{provider}.types.ts`

### DTO Rules
- Use `class-validator` decorators for validation
- Use `@IsOptional()` for partial updates
- **Never use `any` type**

### Entity Rules
- Nullable fields must include `| null` in type annotation
- JSONB columns must have interface type definitions
- **No business logic in entities**

### Example
```typescript
// ❌ BAD: Interface in service file
// user.service.ts
interface UserResponse { id: string; name: string; }

// ✅ GOOD: Separate interface file
// interfaces/user-response.interface.ts
export interface UserResponse { id: string; name: string; }
```

## Error Handling

### Global Exception Filter
All errors are centrally handled by `src/common/filters/http-exception.filter.ts`.
- Registered in `main.ts` via `app.useGlobalFilters()`
- Ensures consistent error response format
- Integrated error logging

### Exception Types
- Invalid input → `BadRequestException`
- Resource not found → `NotFoundException`
- No permission → `ForbiddenException`
- Authentication failed → `UnauthorizedException`
- External API failure → Custom `ExternalApiException` (in `src/common/exceptions/`)

### Rules
- Use Logger class for all logging
- Use HttpException hierarchy
- **Services only throw exceptions**, never format responses (Filter handles formatting)
- **Never use `throw new Error()` directly**
- **Never use `console.log`/`console.error`**
- **Never write empty catch blocks**

## External API Integration

### File Structure
Each provider has:
1. `{provider}.constants.ts` - URLs, versions, constants
2. `{provider}.types.ts` - Response type definitions (no `any` types)
3. `clients/{name}.client.ts` - API call implementations

### Rules
- Define URLs/versions in constants, responses in types with explicit typing (no `any`)
- Use `config.getOrThrow()` for required environment variables
- Log errors with Logger, then throw custom exceptions
- **Services must never directly write HTTP headers/parameters**

### ⚠️ Configuration Values are Validated (IMPORTANT!)
`BASE_URL`, `ENDPOINTS`, authentication headers are verified values from official documentation.
- **Do NOT modify during refactoring**
- If changes needed: verify with official docs + separate task + document reasoning

### Current External Integrations
- **AWS S3**: File uploads
- **Discord**: Bug report webhooks
- **Google**: Places API, OAuth sign-in
- **Kakao**: Login, address search
- **Naver**: Maps, search
- **OpenAI**: GPT-based recommendations

## Refactoring Guidelines

### Before Refactoring
1. Use `grep` to identify dependencies and impact scope
2. Create a plan before making changes

### After Refactoring
1. Run build (`pnpm run build`)
2. Fix errors immediately
3. Remove duplicate/unused code

### Core Principles
- **One responsibility at a time** (no feature additions during refactoring)
- Preserve behavior, maintain testable state at each step
- When moving code, **always delete original OR update to call new location**
- When adding unified method, **immediately delete old methods**

### External API Refactoring (CRITICAL!)
Values in `src/external/**/*.constants.ts` (BASE_URL, ENDPOINTS, auth headers) are **verified values**.
- Changes require official documentation verification
- Must be done as separate task with documented reasoning

### Prohibited
- Moving/splitting without dependency check
- Changing multiple files simultaneously without plan
- Creating new structure without cleanup
- Arbitrary changes to external API configuration

## Database Architecture

### User Entity (Unified Model)
The User entity supports both email/password accounts and OAuth social login:
- `password`: For email/password accounts (nullable)
- `socialId` + `socialType`: For OAuth accounts (nullable)
- The two authentication methods are mutually exclusive (only one can exist)
- All related entities reference only the User entity
- Optimistic locking supported (`@VersionColumn()`)

### Key Entities
- **User**: Unified user model (email/password + OAuth), soft deletes, JSONB preferences, optimistic locking
- **UserAddress**: User addresses (default/search flags, soft deletes)
- **MenuRecommendation**: AI-generated recommendations with reasoning
- **MenuSelection**: User's daily menu choices with status tracking (PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELLED)
- **PlaceRecommendation**: Google Places results linked to menu recommendations
- **EmailVerification**: Time-limited codes for email verification (purpose-based: SIGNUP, RE_REGISTER, PASSWORD_RESET)
- **BugReport**: User bug reports with file uploads, status tracking (UNCONFIRMED/CONFIRMED/FIXED/CLOSED)

### Design Patterns
- Soft deletes with `@DeleteDateColumn()` for audit trail
- JSONB columns for flexible nested data (preferences, imageURLs)
- Cascading deletes with `onDelete: 'CASCADE'`
- Enums for status fields

## Authentication & Authorization

### Strategy
- JWT access tokens (15-minute TTL) + Refresh tokens (httpOnly cookies)
- Local strategy (email/password) + Social OAuth (Kakao, Google)
- Role-based access control: `USER`, `ADMIN`
- Email verification required for registration

### Current User Access
Controllers use `@CurrentUser()` decorator to extract JWT payload:
```typescript
@CurrentUser() authUser: AuthUserPayload
```

### Guards
All endpoints (except auth routes) are protected by `@UseGuards(JwtAuthGuard)`.

## Monitoring & Logging

### Logging
- **Pino HTTP logger** with structured logging
- Sensitive data redaction (auth headers)
- Pretty printing in development
- Ignored paths: `/metrics`

### Metrics
- **Prometheus** metrics collection via `prom-client`
- `HttpMetricsInterceptor` tracks request/response
- `PrometheusService` for custom metrics (globally injectable)
- Metrics exposed at `/metrics` endpoint

### Dashboards
Grafana dashboards configured in `docker-compose.yml`.

## Path Aliases

TypeScript is configured with path alias `@/*` → `src/*`:
```typescript
import { AuthUserPayload } from '@/auth/interfaces/auth-user-payload.interface';
```

## Environment Configuration

- Separate files: `.env.development`, `.env.test`, `.env.production`
- Validation schema in `src/common/config/env.validation.ts`
- Required variables validated on startup
- Use `ConfigService.getOrThrow()` for required values

## Scheduled Tasks

- Uses `@nestjs/schedule` module
- Example: `PreferencesScheduler` in `src/menu/preferences.scheduler.ts`
- Cron-based batch processing with `@Cron()` decorators

## Email Integration

- NestJS Mailer with Handlebars templates
- Templates in `src/auth/templates/`
- Purpose-based verification codes (SIGNUP, RE_REGISTER, PASSWORD_RESET)
- Time-limited verification codes in `EmailVerification` entity
