# Architecture

## System Overview

PickEat is an AI-powered food recommendation platform. The system follows a standard client-server architecture with AI services integrated on the backend.

```
                         +-------------------+
                         |   Web Browser     |
                         +--------+----------+
                                  |
                         +--------v----------+
                         | Frontend (React)  |
                         | Vite Dev :8080    |
                         +--------+----------+
                                  | Axios (REST + SSE)
                         +--------v----------+
                         | Backend (NestJS)  |
                         | API Server :3000  |
                         +--------+----------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
     +--------v------+  +--------v------+  +---------v--------+
     | PostgreSQL 16 |  |    Redis      |  | External APIs    |
     | (TypeORM)     |  |  (Cache)      |  | (OpenAI, Gemini, |
     +---------------+  +---------------+  |  Google, Kakao,  |
                                           |  AWS S3, Discord)|
                                           +------------------+
```

**Request lifecycle:** Browser -> React SPA -> Axios HTTP client -> NestJS Controllers -> Services -> Repository (DB) or External API Clients -> Response back through the chain.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React, TypeScript, Vite | React 19, TS 5.9, Vite 7 |
| **Frontend State** | Redux Toolkit, React Router DOM | RTK 2.10, RR 7.9 |
| **Frontend UI** | Tailwind CSS, shadcn/ui (Radix UI), Framer Motion, Lucide icons | Tailwind 4.1, Framer Motion 12 |
| **Frontend I18n** | i18next, react-i18next | i18next 25 |
| **Frontend Maps** | Google Maps JS API | @googlemaps/js-api-loader 2 |
| **Frontend Charts** | Recharts | 3.6 |
| **Backend** | NestJS, TypeScript | NestJS 11, TS 5.7 |
| **Database** | PostgreSQL, TypeORM | PG 16, TypeORM 0.3 |
| **Cache** | Redis (ioredis + cache-manager) | ioredis 5 |
| **Auth** | JWT (Passport), bcrypt | passport-jwt 4 |
| **AI / LLM** | OpenAI SDK (GPT-5.1, GPT-4o-mini), Google Gemini (@google/genai) | OpenAI SDK 6, @google/genai 1 |
| **External APIs** | Google Places, Google Custom Search, Kakao OAuth, AWS S3, Discord Webhooks | - |
| **Email** | NestJS Mailer + Handlebars | @nestjs-modules/mailer 2 |
| **Scheduler** | @nestjs/schedule (cron) | @nestjs/schedule 6 |
| **Logging** | nestjs-pino | nestjs-pino 4 |
| **Security** | Helmet, Throttler (rate limiting), CORS | Helmet 8, @nestjs/throttler 6 |
| **Testing (FE)** | Vitest, Playwright, MSW | Vitest 4, Playwright 1.57 |
| **Testing (BE)** | Jest, SWC | Jest 29 |

## Architecture Layers

### Frontend Architecture

The frontend is a React 19 SPA built with Vite, organized into feature-based modules.

**Key architectural decisions:**

- **Feature-based modules** (`src/features/`): Each domain (agent, auth, user, admin, etc.) is self-contained with its own pages, components, hooks, API service, and types.
- **Shared layer** (`src/shared/`): Cross-cutting concerns -- reusable components, hooks, utilities, UI primitives (shadcn/ui), and the API client.
- **API layer**: Centralized Axios client (`shared/api/client.ts`) with request/response interceptors for automatic token injection, 401 token refresh (single-flight pattern), and language header injection. All endpoint paths defined in `shared/api/endpoints.ts`.
- **State management**: Redux Toolkit with three slices -- `authSlice` (authentication + user profile), `agentSlice` (AI recommendation workflow state), `userDataSlice` (cached addresses/preferences with 5-min stale time).
- **Routing**: React Router v7 with lazy-loaded routes, guard components (`ProtectedRoute`, `AdminRoute`, `UserOnlyRoute`), and route groups (main, auth, user, history, admin, misc).
- **Internationalization**: i18next with Korean (default) and English, browser language detection, server-synced language preference.

### Backend Architecture

The backend is a NestJS 11 modular application following a strict layered architecture. For the full module breakdown, see [Backend Structure](backend-structure.md).

**Key architectural decisions:**

- **Layered pattern**: Controller (HTTP concerns) -> Service (business logic, max 500 lines) -> Repository (TypeORM) / Client (external APIs).
- **Service decomposition**: Large services are split by responsibility (e.g., Auth has 5 services + 1 provider, Menu has 13 services + 2 abstract base classes).
- **Global infrastructure**: `ExternalModule.forRoot()` provides all external API clients globally. `RedisCacheModule` is global. `HttpExceptionFilter` handles all errors.
- **Dynamic module swapping**: `ExternalModule` swaps real clients with `MockExternalModule` when `E2E_MOCK=true`, enabling full E2E testing without external dependencies.
- **Scheduled tasks**: Schedulers using `SchedulerRegistry` + `OnModuleInit` pattern with environment variable-based cron configuration (`CRON_*`), Asia/Seoul timezone, and PostgreSQL advisory locks for distributed safety. Located in `batch/schedulers/` (preference batch processing), `notification/services/` (notification delivery), and `rating/services/` (rating aggregation).

### External API Integration

| Provider | Client Class | Purpose |
|----------|-------------|---------|
| **OpenAI** | Services in `menu/services/` | GPT-5.1 for menu recommendations, GPT-4o-mini for request validation. Two-stage pipeline. Menu services use an inheritance pattern: `BaseOpenaiService` (OpenAI client management) -> `BaseMenuService` (common menu logic) -> concrete services (Gpt51MenuService, GptWebSearchMenuService, etc.). |
| **OpenAI Batch** | `OpenAiBatchClient` | Async batch processing for user preference/taste analysis from meal history. |
| **Google Gemini** | `GeminiClient` | Place recommendations using Google Search + Maps Grounding. |
| **Google Places** | `GooglePlacesClient` | Place search, details, and photos (New API). |
| **Google Custom Search** | `GoogleSearchClient` | Blog/web search results for restaurants. |
| **Google OAuth** | `GoogleOAuthClient` | Google OAuth 2.0 token exchange and user profile. |
| **Kakao OAuth** | `KakaoOAuthClient` | Kakao OAuth login flow. |
| **AWS S3** | `S3Client` | File uploads for bug report images and user place images. Presigned URLs. |
| **Discord** | `DiscordWebhookClient` | Bug report notifications and scheduler failure alerts. |
| **Google Maps JS** | Frontend `@googlemaps/js-api-loader` | Map rendering and place visualization in the browser. |

All external clients are isolated in `src/external/{provider}/` with dedicated constants, types, and client classes. Mock implementations exist in `src/external/mocks/` for E2E testing.

> **Note:** A `src/external/naver/` directory exists but is **legacy and inactive** -- it is not registered in `ExternalModule` and not used by any active module.

## Key Data Flows

### Menu Recommendation Flow

The core feature uses a two-stage GPT pipeline:

```
User enters prompt (+ preferences, address)
    |
    v
[Frontend] AgentPage -> useAgentActions -> agent/api.ts
    |  (POST /menu/recommend/stream -- SSE)
    v
[Backend] MenuController -> MenuService -> TwoStageMenuService
    |
    +--[Stage 1] GPT-4o-mini Validation (Gpt4oMiniValidationService)
    |   - Validates food-related request
    |   - Classifies intent (specific_menu / mood_based / mixed)
    |   - Extracts constraints (budget, dietary, urgency)
    |   - Rejects non-food requests -> InvalidMenuRequestException
    |
    +--[Stage 2] GPT-5.1 Menu Recommendation
    |   - With address/demographics -> GptWebSearchMenuService (web search enhanced)
    |   - Without -> Gpt51MenuService (standard)
    |   - Returns structured menu recommendations with reasoning
    |
    v
[Frontend] SSE stream -> agentSlice updates -> ResultsSection renders
    |
    v
User selects menu -> Place search (Gemini + Community) -> Place selection -> Meal confirmation
```

### Authentication Flow

```
[Login/Register]
    |
    +-- Email/Password -> POST /auth/login (LocalAuthGuard) -> JWT issued
    +-- Kakao OAuth -> POST /auth/kakao/doLogin -> JWT issued
    +-- Google OAuth -> POST /auth/google/doLogin -> JWT issued
    |
    v
[Token Storage]
    localStorage (access token)
    |
    v
[Authenticated Requests]
    Axios request interceptor injects Bearer token
    |
    +-- 401 Response -> Single-flight token refresh (POST /auth/refresh)
    |   +-- Success -> Retry original request with new token
    |   +-- Failure -> Redirect to /login, clear auth state
    |
    v
[Silent Refresh]
    App initialization (AppRoutes mount) -> initializeAuth thunk
    -> Load user from stored token -> Fetch preferences/addresses
```

### Place Registration Flow

```
[User submits place]
    UserPlaceCreatePage -> POST /user-places (with images -> S3 upload)
    |
    v
[Admin moderation]
    AdminUserPlaceListPage -> GET /admin/user-places
    |
    +-- Approve (PATCH /admin/user-places/:id/approve) -> Place becomes public
    +-- Reject (PATCH /admin/user-places/:id/reject) -> Rejection history recorded
    |
    v
[Community recommendations]
    Approved places appear in community place search results
    (CommunityPlaceService queries approved UserPlace entities)
```

### Preference Analysis Flow (Background)

```
[User confirms meal selection]
    POST /menu/selections
    |
    v
[Batch Processing] (Cron-scheduled)
    PreferencesBatchScheduler -> Groups pending selections
    -> BatchRequestBuilderService -> OpenAI Batch API submission
    |
    v
[Result Polling] (Cron-scheduled)
    PreferencesBatchResultScheduler -> Polls completed batches
    -> PreferenceBatchResultProcessorService -> Updates UserTasteAnalysis
    |
    v
[Enhanced Recommendations]
    Taste analysis feeds into future GPT menu recommendation prompts
```

## Cross-Stack Communication

### API Contract

Frontend and backend share an implicit API contract through:

| Frontend | Backend |
|----------|---------|
| `shared/api/endpoints.ts` (URL paths) | Controller route decorators |
| `features/*/types.ts` (request/response types) | `*/dto/*.dto.ts` (validated DTOs) |
| `features/*/api.ts` (service functions) | `*.controller.ts` (endpoint handlers) |

The Axios client is configured with `VITE_API_BASE_URL` (defaults to `http://localhost:3000`). Every request includes `Authorization` (Bearer token) and `Accept-Language` headers.

### SSE Streaming

Menu recommendations and place search use Server-Sent Events for real-time streaming:
- Frontend: `useStreamingRequest` hook (shared)
- Backend: Express `Response` manual streaming (`res.setHeader('Content-Type', 'text/event-stream')` + `res.write()`) with `safeSendEvent` wrapper for safe event emission, `AbortController` for cancellation, and `streamingAsyncLocalStorage` for nested retry/status callbacks
- Used for: menu recommendation stream, place search stream, community place stream

### Error Handling

- **Backend**: `HttpExceptionFilter` catches all exceptions, returns structured error responses with error codes from `common/constants/error-codes.ts`.
- **Frontend**: `extractErrorMessage()` utility parses server error responses. Priority: server message -> error.message -> fallback string. Feature-level `ErrorBoundary` and `FeatureErrorBoundary` components catch render errors.

## Security

| Mechanism | Implementation |
|-----------|---------------|
| Authentication | JWT (access + refresh tokens via Passport) |
| Authorization | Role-based guards (`RolesGuard` with USER, ADMIN, SUPER_ADMIN roles) |
| Rate Limiting | `@nestjs/throttler` (100 req/min globally) |
| Input Validation | `class-validator` + `class-transformer` on all DTOs |
| HTTP Security | Helmet (security headers) |
| CORS | Configured in NestJS bootstrap |
| File Upload | `ImageValidationPipe` (type + size validation) |
| Token Refresh | Single-flight pattern prevents duplicate refresh requests |
| Soft Deletes | User accounts use soft delete (deactivation, not permanent removal) |
