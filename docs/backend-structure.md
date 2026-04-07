# Backend Structure

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | NestJS 11 |
| Language | TypeScript 5.7 (ES2023) |
| Database | PostgreSQL 16 + TypeORM 0.3 |
| Cache | Redis (ioredis + cache-manager) |
| Authentication | JWT (Passport), bcrypt |
| AI / LLM | OpenAI SDK 6 (GPT-5.1, GPT-4o-mini), Google Gemini (`@google/genai`) |
| External APIs | Google Places API, Google Custom Search, Kakao OAuth, AWS S3, Discord Webhook |
| Email | NestJS Mailer + Handlebars templates |
| Scheduler | `@nestjs/schedule` (SchedulerRegistry + OnModuleInit pattern) |
| Logging | nestjs-pino |
| Security | Helmet, Throttler (rate limiting), CORS |
| Validation | class-validator + class-transformer |
| Testing | Jest, SWC (compiler) |

## Architecture Overview

```
Client Request
    |
    v
Controller          -- Request validation, response formatting
    |
    v
Service (Facade)    -- Business logic orchestration
    |
    v
Sub-Services        -- Specific business logic (< 500 lines each)
    |
    v
Repository / Client -- TypeORM Repository (DB) or External API Client
```

**Key principles:**
- Controllers handle HTTP concerns only (request/response)
- Services contain business logic, throw exceptions (never format responses)
- Each service stays under 500 lines; larger services are split by responsibility
- External API calls are isolated in dedicated Client classes under `src/external/`
- Global exception handling via `HttpExceptionFilter`
- NestJS Logger only (no `console.log`)
- Path alias `@/*` maps to `src/*`

## Directory Structure

```
src/
├── main.ts                        # Application bootstrap
├── app.module.ts                  # Root module
│
├── admin/                         # Admin modules (role-gated)
│   ├── admin.module.ts
│   ├── dashboard/                 # Dashboard stats & trends
│   ├── settings/                  # Admin management (promote/demote)
│   ├── user/                      # User management (list, detail, deactivate)
│   └── interfaces/
│
├── auth/                          # Authentication & authorization
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── constants/                 # Email content constants
│   ├── decorators/                # @CurrentUser, @Roles, @SuperAdminOnly
│   ├── dto/                       # 14 DTOs (login, register, OAuth, email, password)
│   ├── entities/                  # EmailVerification
│   ├── guard/                     # JwtAuthGuard, LocalAuthGuard, RolesGuard
│   ├── interfaces/
│   ├── provider/                  # JwtTokenProvider
│   ├── services/                  # 5 split services
│   ├── strategy/                  # JWT, Local (Passport)
│   └── templates/                 # Handlebars email templates (ko/en)
│
├── batch/                         # OpenAI Batch API processing
│   ├── batch.module.ts
│   ├── entities/                  # BatchJob
│   ├── interfaces/
│   ├── schedulers/                # 3 cron schedulers
│   ├── services/                  # 6 services
│   └── types/
│
├── bug-report/                    # Bug reporting with Discord notifications
│   ├── bug-report.controller.ts
│   ├── bug-report.module.ts
│   ├── bug-report.service.ts
│   ├── controllers/               # AdminBugReportController
│   ├── dto/
│   ├── entities/                  # BugReport, StatusHistory, AdminNote, Notification
│   ├── enum/
│   ├── services/                  # DiscordMessageBuilderService
│   └── utils/                     # discord-format.util.ts
│
├── common/                        # Shared infrastructure
│   ├── cache/                     # RedisCacheModule (Global), RedisCacheService
│   ├── config/                    # database, env validation, logger, multer
│   ├── constants/                 # business, error-codes, message-codes, roles, test-mode
│   ├── decorators/                # @RequestLanguage
│   ├── exceptions/                # 6 custom exceptions
│   ├── filters/                   # HttpExceptionFilter (global catch-all)
│   ├── interfaces/                # Pagination
│   ├── pipeline/                  # Generic pipeline utility
│   ├── pipes/                     # ImageValidationPipe
│   ├── services/                  # SchedulerAlertModule/Service
│   ├── utils/                     # 10+ utilities (retry, AI response, language, etc.)
│   └── validators/                # language, s3-url
│
├── external/                      # External API integrations
│   ├── external.module.ts         # Dynamic module (real vs mock)
│   ├── aws/                       # S3Client
│   ├── discord/                   # DiscordWebhookClient
│   ├── gemini/                    # GeminiClient + prompts
│   ├── google/                    # GooglePlacesClient, GoogleSearchClient, GoogleOAuthClient
│   ├── kakao/                     # KakaoOAuthClient
│   ├── naver/                     # NaverMapClient, NaverSearchClient (legacy)
│   ├── openai/                    # OpenAiBatchClient + prompts (8 prompt files)
│   └── mocks/                     # MockExternalModule + mock clients for E2E testing
│
├── menu/                          # Core menu recommendation (AI-powered)
│   ├── menu.controller.ts         # 14 endpoints
│   ├── menu.module.ts
│   ├── menu.service.ts            # Facade service
│   ├── dto/                       # 9 DTOs
│   ├── entities/                  # MenuRecommendation, MenuSelection, PlaceRecommendation
│   ├── enum/                      # PlaceRecommendationSource
│   ├── interfaces/                # 8 interfaces
│   ├── services/                  # 13 services + 2 abstract base classes (see Menu Module section)
│   └── utils/                     # menu-payload.util.ts, place-id.util.ts, menu-selection-state-machine.ts
│
├── notification/                  # Push notification system
│   ├── notification.controller.ts
│   ├── notification.module.ts
│   ├── notification.service.ts
│   ├── controllers/               # admin-notification.controller.ts (미구현)
│   ├── dto/
│   ├── entities/                  # Notification
│   ├── enum/
│   └── services/                  # NotificationSchedulerService
│
├── rating/                        # Place rating system
│   ├── rating.controller.ts       # 6 endpoints
│   ├── rating.module.ts
│   ├── rating.service.ts
│   ├── dto/                       # 5 DTOs
│   ├── entities/                  # PlaceRating
│   ├── interfaces/
│   └── services/                  # RatingSchedulerService
│
├── user/                          # User management
│   ├── user.controller.ts         # 14 endpoints
│   ├── user.module.ts
│   ├── user.service.ts
│   ├── dto/                       # 12 DTOs
│   ├── entities/                  # User, UserAddress, UserTasteAnalysis
│   ├── enum/
│   ├── interfaces/
│   ├── preference-update-ai.service.ts  # AI preference update (root level)
│   └── services/                  # 6 services
│
├── user-place/                    # Community place management
│   ├── user-place.controller.ts   # 6 endpoints
│   ├── user-place.module.ts
│   ├── user-place.service.ts
│   ├── controllers/               # AdminUserPlaceController
│   ├── dto/
│   ├── entities/                  # UserPlace, UserPlaceRejectionHistory
│   ├── enum/
│   ├── interfaces/
│   └── services/                  # AdminUserPlaceService, AdminUserPlaceStatsService
│
└── migrations/                    # TypeORM migration files
```

## Feature Modules

### Menu Module (Core)

The most complex module. Handles AI-powered menu recommendations, place discovery, and user meal selections.

**Controller:** `MenuController` -- 14 endpoints including SSE streaming
- `POST /menu/recommend` -- AI menu recommendation
- `POST /menu/recommend/stream` -- SSE streaming menu recommendation
- `POST /menu/selections` -- Create meal selection
- `GET /menu/selections/history` -- Selection history
- `PATCH /menu/selections/:id` -- Update selection
- `GET /menu/recommendations/history` -- Recommendation history (paginated)
- `GET /menu/recommendations/:id` -- Recommendation detail
- `GET /menu/recommend/places/search` -- Gemini-based place recommendations
- `GET /menu/recommend/places/search/stream` -- SSE streaming place recommendations
- `GET /menu/recommend/places/community` -- Community place recommendations
- `GET /menu/recommend/places/community/stream` -- SSE streaming community places
- `GET /menu/recommend/places/v2` -- Gemini V2 place recommendations
- `GET /menu/restaurant/blogs` -- Blog/web search for restaurants
- `GET /menu/places/:placeId/detail` -- Google Places detail

**Services (14 services + 2 abstract base classes):**

| Service | Role |
|---------|------|
| `MenuService` | Facade -- orchestrates sub-services for the controller |
| `TwoStageMenuService` | **Orchestrator** for two-stage GPT pipeline |
| `Gpt4oMiniValidationService` | Stage 1: Request validation & intent classification (GPT-4o-mini) |
| `Gpt51MenuService` | Stage 2: Deep menu recommendation (GPT-5.1) |
| `GptWebSearchMenuService` | Stage 2 variant: Menu recommendation with web search (location/demographic-aware) |
| `WebSearchSummaryService` | Generates web search summaries for menu context |
| `BaseMenuService` | **Abstract** base class for GPT menu services |
| `BaseOpenaiService` | **Abstract** base class for OpenAI service interactions |
| `OpenAiMenuService` | OpenAI API integration for menu recommendations |
| `OpenAiPlacesService` | OpenAI-based place recommendations |
| `OpenAiCommunityPlacesService` | OpenAI-based community place recommendations |
| `GeminiPlacesService` | Gemini-based place recommendations (Google Search + Maps Grounding) |
| `CommunityPlaceService` | Recommends places from user-registered community places |
| `PlaceService` | Place data handling and Google Places integration |
| `MenuRecommendationService` | CRUD for MenuRecommendation entity |
| `MenuSelectionService` | CRUD for MenuSelection entity |

**Two-Stage GPT Pipeline:**

```
User Prompt + Preferences
        |
        v
  [Stage 1] GPT-4o-mini Validation
  - Validates food-related request
  - Classifies intent (specific_menu / mood_based / mixed)
  - Extracts constraints (budget, dietary, urgency)
  - Returns suggested categories
        |
        | (if invalid -> InvalidMenuRequestException)
        v
  [Stage 2] GPT-5.1 Menu Recommendation
  - If user has address/demographics -> GptWebSearchMenuService (with web search)
  - Otherwise -> Gpt51MenuService (standard)
  - Uses validation context from Stage 1
  - Returns structured menu recommendations with reasoning
```

**Dependencies:** UserModule, HttpModule, ExternalModule (global -- GooglePlacesClient, GeminiClient, etc.)

---

### Auth Module

Handles authentication, authorization, email verification, and password management.

**Controller:** `AuthController` -- 16 endpoints
- `POST /auth/kakao/doLogin` -- Kakao OAuth (web)
- `POST /auth/kakao/appLogin` -- Kakao OAuth (mobile app)
- `POST /auth/google/doLogin` -- Google OAuth
- `POST /auth/register` -- Email registration
- `POST /auth/login` -- Email/password login (LocalAuthGuard)
- `GET /auth/check-email` -- Email availability check
- `POST /auth/email/send-code` -- Send verification code
- `POST /auth/email/verify-code` -- Verify email code
- `POST /auth/password/reset/send-code` -- Send password reset code
- `POST /auth/password/reset/verify-code` -- Verify reset code
- `POST /auth/password/reset` -- Reset password
- `GET /auth/me` -- Get current user profile (JWT-protected)
- `POST /auth/refresh` -- Refresh access token
- `POST /auth/logout` -- Logout (invalidate token)
- `POST /auth/re-register` -- Re-register deactivated email account
- `POST /auth/re-register/social` -- Re-register deactivated social account

**Services (6 services + 1 provider):**

| Service | Role |
|---------|------|
| `AuthService` | Core auth logic: register, login, logout, refresh, OAuth flows |
| `AuthTokenService` | JWT token management (access/refresh tokens) |
| `AuthSocialService` | OAuth integration (Kakao, Google) |
| `AuthPasswordService` | Password reset flow |
| `EmailVerificationService` | Time-limited code generation and verification |
| `EmailNotificationService` | Email sending via NestJS Mailer |
| `JwtTokenProvider` | **Provider** -- JWT token creation utility |

**Guards:** JwtAuthGuard, LocalAuthGuard, RolesGuard

**Strategies:** JWT (Passport), Local (Passport)

**Decorators:** `@CurrentUser()`, `@Roles()`, `@SuperAdminOnly()`

**Email Templates:** Handlebars templates for verification, welcome, and account deactivation (ko/en)

**Dependencies:** UserModule, PassportModule, JwtModule, MailerModule, HttpModule

---

### User Module

Manages user profiles, preferences, addresses, and taste analysis.

**Controller:** `UserController` -- 14 endpoints
- `GET /user/preferences` -- Get food preferences
- `POST /user/preferences` -- Update preferences (likes/dislikes)
- `GET /user/address/search` -- Search addresses (Google Places / Kakao)
- `PATCH /user/address` -- Update single address
- `PATCH /user` -- Update profile (name, birthDate, gender)
- `DELETE /user/me` -- Deactivate account (soft delete)
- `PATCH /user/language` -- Update preferred language
- `GET /user/address/default` -- Get default address
- `GET /user/addresses` -- List all addresses
- `POST /user/addresses` -- Create address
- `PATCH /user/addresses/:id` -- Update address
- `POST /user/addresses/batch-delete` -- Batch delete addresses
- `PATCH /user/addresses/:id/default` -- Set default address
- `PATCH /user/addresses/:id/search` -- Set search address

**Services (8 total):**

| Service | Role |
|---------|------|
| `UserService` | Core user CRUD, profile management |
| `UserAddressService` | Address CRUD with default/search flags |
| `UserPreferenceService` | Food preference management (likes/dislikes) |
| `UserTasteAnalysisService` | AI-generated taste analysis management |
| `PreferenceUpdateAiService` | AI-based preference update processing |
| `AddressSearchService` | Address search via Google Places / Kakao |
| `AdminInitializerService` | Initial admin user creation on startup |
| `TestUserSeederService` | Test data seeding |

**Entities:** User, UserAddress, UserTasteAnalysis

**Dependencies:** GoogleModule, KakaoModule

---

### Batch Module

Processes menu selections via OpenAI Batch API for preference analysis. Uses cron schedulers to submit, poll, and retry batch jobs.

**Schedulers (3):**

| Scheduler | Role |
|-----------|------|
| `PreferencesBatchScheduler` | Submits pending menu selections as OpenAI batch requests |
| `PreferencesBatchResultScheduler` | Polls for completed batch results and processes them |
| `PreferencesRetryBatchScheduler` | Retries failed batch jobs |

**Services (6):**

| Service | Role |
|---------|------|
| `PreferenceBatchService` | Orchestrates batch job lifecycle |
| `BatchJobService` | CRUD for BatchJob entity |
| `SelectionGroupingService` | Groups menu selections for batch processing |
| `BatchRequestBuilderService` | Builds OpenAI Batch API requests |
| `PreferenceBatchResultProcessorService` | Processes batch results into user taste analysis |
| `MenuSelectionSeederService` | Seeds menu selection test data |

**Entity:** BatchJob (tracks batch job status)

**Dependencies:** OpenAiModule (OpenAiBatchClient), UserModule, SchedulerAlertModule

---

### Bug Report Module

Bug reporting with image upload (S3) and Discord webhook notifications.

**Controllers:**
- `BugReportController` -- `POST /bug-reports` (create with image uploads, max 5)
- `AdminBugReportController` -- `GET/PATCH /admin/bug-reports` (list, detail, status update, role-gated)

**Services:** BugReportService, DiscordMessageBuilderService

**Entities:** BugReport, BugReportStatusHistory, BugReportAdminNote, BugReportNotification

**Status Flow:** UNCONFIRMED -> CONFIRMED -> FIXED

**Dependencies:** UserModule, AwsModule (S3), DiscordModule

---

### Rating Module

Place rating system where users rate restaurants they've visited.

**Controller:** `RatingController` -- 6 endpoints
- `POST /ratings/select` -- Select a place to rate
- `GET /ratings/pending` -- Get pending rating
- `POST /ratings/submit` -- Submit rating
- `POST /ratings/skip` -- Skip rating
- `POST /ratings/dismiss` -- Dismiss rating
- `GET /ratings/history` -- Rating history

**Services:** RatingService, RatingSchedulerService (cron-based rating updates)

**Entity:** PlaceRating

**Dependencies:** UserModule, UserPlace entity, SchedulerAlertModule

---

### Notification Module

Push notification system with scheduled delivery.

**Controller:** `NotificationController` -- (endpoints pending)

**Services:** NotificationService, NotificationSchedulerService (cron-based delivery)

**Entity:** Notification

**Dependencies:** UserModule, SchedulerAlertModule

<!-- TODO: Admin Notification 기능 구현 후 문서화 예정 -->

---

### User Place Module

Community-registered restaurant management with admin moderation.

**Controllers:**
- `UserPlaceController` -- 6 endpoints: check, create (with images), list, detail, update, delete
- `AdminUserPlaceController` -- Admin moderation (list, detail, approve/reject, update)

**Services:** UserPlaceService, AdminUserPlaceService, AdminUserPlaceStatsService

**Entities:** UserPlace, UserPlaceRejectionHistory

**Dependencies:** UserModule, AwsModule (S3 for images), AdminAuditLog entity

---

## External API Integration

### ExternalModule (Dynamic, Global)

`ExternalModule.forRoot()` provides all external API clients globally. In `E2E_MOCK=true` mode, it swaps real clients with `MockExternalModule` for testing.

```
ExternalModule.forRoot()
├── Production: GoogleModule, GeminiModule, KakaoModule, OpenAiModule, AwsModule, DiscordModule
└── E2E_MOCK=true: MockExternalModule (all clients mocked)
```

### Google (`src/external/google/`)

| Client | Purpose |
|--------|---------|
| `GooglePlacesClient` | Google Places API (New) -- place search, details, photos |
| `GoogleSearchClient` | Google Custom Search (Programmable Search) -- blog/web results |
| `GoogleOAuthClient` | Google OAuth 2.0 -- token exchange, user profile |

Module: `GoogleModule` (exports all 3 clients)

### Gemini (`src/external/gemini/`)

| Client | Purpose |
|--------|---------|
| `GeminiClient` | Google Gemini API (`@google/genai`) -- place recommendations with Search + Maps Grounding |

Module: `GeminiModule` (Global)

Prompts: `place-recommendation.prompts.ts`

### OpenAI (`src/external/openai/`)

| Client | Purpose |
|--------|---------|
| `OpenAiBatchClient` | OpenAI Batch API -- async batch processing for preference analysis |

Module: `OpenAiModule`

Prompts (8 files):
- `menu-recommendation.prompts.ts` -- GPT-5.1 menu recommendation
- `menu-recommendation-system.prompts.ts` -- System prompts for menu recommendation
- `menu-recommendation-web-search.prompts.ts` -- Web search-enhanced prompts
- `menu-validation.prompts.ts` -- GPT-4o-mini validation (Stage 1)
- `preference-update.prompts.ts` -- Batch preference analysis
- `google-places-recommendation.prompts.ts` -- Place recommendation via OpenAI
- `community-place-recommendation.prompts.ts` -- Community place recommendation
- `web-search-summary.prompts.ts` -- Web search summary generation

Note: Actual OpenAI chat completion services reside in `menu/services/` (e.g., `openai-menu.service.ts`). The `OpenAiModule` only provides the Batch API client.

### Kakao (`src/external/kakao/`)

| Client | Purpose |
|--------|---------|
| `KakaoOAuthClient` | Kakao OAuth -- token exchange, user profile |

Module: `KakaoModule`

### AWS (`src/external/aws/`)

| Client | Purpose |
|--------|---------|
| `S3Client` | AWS S3 -- file upload (bug report images, user place images) with presigned URLs |

Module: `AwsModule`

### Discord (`src/external/discord/`)

| Client | Purpose |
|--------|---------|
| `DiscordWebhookClient` | Discord webhooks -- bug report notifications, scheduler alerts |

Module: `DiscordModule`

### Naver (`src/external/naver/`) -- Legacy

| Client | Purpose |
|--------|---------|
| `NaverMapClient` | Naver Map API (legacy, being replaced by Google) |
| `NaverSearchClient` | Naver Search API (legacy) |

Service: `LocationService`

Note: No dedicated module. Not registered in `ExternalModule`. Being phased out in favor of Google APIs.

### Mock Module (`src/external/mocks/`)

`MockExternalModule` provides mock implementations for E2E testing:
- `MockGooglePlacesClient`, `MockGoogleSearchClient`
- `MockGeminiClient`
- `MockS3Client`, `MockDiscordWebhookClient`
- `MockTwoStageMenuService`, `MockOpenAiPlacesService`
- Factory-based mocks for `GoogleOAuthClient` and `KakaoOAuthClient`

---

## Common Infrastructure

### Cache (`src/common/cache/`)

- `RedisCacheModule` -- Global module, wraps `@nestjs/cache-manager` with ioredis
- `RedisCacheService` -- Typed cache operations (get, set, del)
- Connects to Redis via `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` env vars

### Scheduler Alert (`src/common/services/`)

- `SchedulerAlertModule` / `SchedulerAlertService` -- Sends alerts (likely via Discord) when scheduled tasks fail

### Guards

| Guard | Location | Purpose |
|-------|----------|---------|
| `JwtAuthGuard` | `auth/guard/` | JWT token validation (most endpoints) |
| `LocalAuthGuard` | `auth/guard/` | Email/password login (Passport Local) |
| `RolesGuard` | `auth/guard/` | Role-based access control (admin endpoints) |
| `ThrottlerGuard` | `app.module.ts` | Global rate limiting (100 req/min, disabled in test) |

### Pipes

| Pipe | Location | Purpose |
|------|----------|---------|
| `ImageValidationPipe` | `common/pipes/` | Validates uploaded image files (type, size) |

### Filters

| Filter | Location | Purpose |
|--------|----------|---------|
| `HttpExceptionFilter` | `common/filters/` | Global catch-all exception handler with structured error responses |

### Custom Exceptions (`src/common/exceptions/`)

| Exception | Purpose |
|-----------|---------|
| `ConfigMissingException` | Missing required configuration |
| `ConfigValidationException` | Invalid configuration values |
| `ExternalApiException` | External API call failures (includes provider info) |
| `InvalidMenuRequestException` | Non-food-related menu requests (Stage 1 rejection) |
| `OpenaiResponseException` | OpenAI API response errors |
| `PipelineFailedException` | Pipeline execution failure |

### Configuration (`src/common/config/`)

| Config | Purpose |
|--------|---------|
| `database.config.ts` | TypeORM + PostgreSQL async configuration |
| `env.validation.ts` | Environment variable validation (class-validator) |
| `logger.config.ts` | Pino logger configuration |
| `multer.config.ts` | File upload configuration |

### Constants (`src/common/constants/`)

| File | Purpose |
|------|---------|
| `business.constants.ts` | Business rules (SSE config, auth timing, user place limits) |
| `error-codes.ts` | Standardized error codes |
| `message-codes.ts` | Standardized success message codes |
| `roles.constants.ts` | Role definitions (USER, ADMIN, SUPER_ADMIN) |
| `test-mode.constants.ts` | Test mode detection |

### Utilities (`src/common/utils/`)

| Utility | Purpose |
|---------|---------|
| `retry.util.ts` | Retry logic with exponential backoff |
| `retry-context.ts` | AsyncLocalStorage for streaming retry/status events |
| `ai-response.util.ts` | AI response parsing and validation |
| `language.util.ts` | Language code parsing (ko/en) |
| `advisory-lock.util.ts` | PostgreSQL advisory locks for concurrency |
| `external-api-error.util.ts` | External API error formatting |
| `file-validation.util.ts` | File type/size validation |
| `openai-token-logger.util.ts` | Token usage logging |
| `request-language.util.ts` | Request language extraction |
| `test-mode.util.ts` | Test mode detection |

### Pipeline (`src/common/pipeline/`)

Generic pipeline utility for composing sequential processing steps.

---

## Admin Modules

All admin endpoints are protected by `JwtAuthGuard` + `RolesGuard` + `@Roles(...ADMIN_ROLES)`.

### Admin Dashboard (`admin/dashboard/`)

**Controller:** `AdminDashboardController` -- `GET /admin/dashboard/*`
- `GET /admin/dashboard/summary` -- User count, recommendation count, bug report stats
- `GET /admin/dashboard/recent-activities` -- Recent user activities
- `GET /admin/dashboard/trends` -- Usage trends over time

**Service:** `AdminDashboardService`

**Entities used:** User, MenuRecommendation, BugReport (read-only)

### Admin User Management (`admin/user/`)

**Controller:** `AdminUserController` -- `GET/PATCH /admin/users/*`
- `GET /admin/users` -- Paginated user list with filters
- `GET /admin/users/:id` -- User detail (addresses, recommendations, selections, bug reports)
- `PATCH /admin/users/:id/deactivate` -- Deactivate user account
- `PATCH /admin/users/:id/activate` -- Activate user account

**Service:** `AdminUserService`

**Entities used:** User, UserAddress, MenuRecommendation, MenuSelection, BugReport, AdminAuditLog

**Dependencies:** UserModule, RedisCacheModule

### Admin Settings (`admin/settings/`)

**Controller:** `AdminSettingsController` -- `GET/POST/DELETE /admin/settings/*`
- Admin role management (promote/demote users)
- Super admin only access for certain operations (`@SuperAdminOnly()`)

**Service:** `AdminSettingsService`

**Entities:** AdminAuditLog

**Dependencies:** UserModule

### Admin Bug Reports (`bug-report/controllers/`)

Located within the BugReport module (not a separate admin module).

**Controller:** `AdminBugReportController` -- `GET/PATCH /admin/bug-reports/*`
- List bug reports with filters and pagination
- View bug report detail
- Update bug report status (UNCONFIRMED -> CONFIRMED -> FIXED)

### Admin User Places (`user-place/controllers/`)

Located within the UserPlace module.

**Controller:** `AdminUserPlaceController` -- `GET/PATCH /admin/user-places/*`
- List, detail, approve/reject, update community places
- Statistics for user place submissions

**Services:** `AdminUserPlaceService`, `AdminUserPlaceStatsService`
