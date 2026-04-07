# API Reference

## Overview

- **Base URL**: `http://localhost:3000`
- **Total Endpoints**: 75
- **Framework**: NestJS 11 + TypeScript

## Authentication

All endpoints require JWT Bearer authentication unless marked as **Public**.

```
Authorization: Bearer <access_token>
```

- Tokens are issued via login/register endpoints
- Use `POST /auth/refresh` to refresh expired access tokens
- Admin endpoints additionally require `ADMIN` or `SUPER_ADMIN` role

---

## Endpoints

### Auth

Controller: `auth/auth.controller.ts` | Prefix: `/auth`

| Method | Path | Handler | Auth | Request | Response | Notes |
|--------|------|---------|------|---------|----------|-------|
| POST | `/auth/kakao/doLogin` | kakaoLogin | Public | Body: `RedirectDto` {code, reRegister?} | AuthResult | Throttle: 10/min |
| POST | `/auth/kakao/appLogin` | kakaoAppLogin | Public | Body: `AppKakaoLoginDto` {accessToken, reRegister?} | AuthResult | Throttle: 10/min |
| POST | `/auth/google/doLogin` | googleLogin | Public | Body: `RedirectDto` {code, reRegister?} | AuthResult | Throttle: 10/min |
| POST | `/auth/register` | register | Public | Body: `RegisterDto` {email, password, name, birthDate, gender} | {messageCode} | Throttle: 5/min. Separate login required after registration |
| POST | `/auth/login` | login | Public | Body: `LoginDto` {email, password} via LocalAuthGuard | AuthResult | Throttle: 10/min |
| GET | `/auth/check-email` | checkEmail | Public | Query: `CheckEmailDto` {email} | {exists: boolean} | Throttle: 10/min |
| POST | `/auth/email/send-code` | sendEmailCode | Public | Body: `SendEmailCodeDto` {email, purpose?} | {success, ...} | Throttle: 3/min. Purpose: SIGNUP, RESET_PASSWORD, RE_REGISTER |
| POST | `/auth/email/verify-code` | verifyEmailCode | Public | Body: `VerifyEmailCodeDto` {email, code, purpose?} | {success, messageCode} | Throttle: 5/min |
| POST | `/auth/password/reset/send-code` | sendResetPasswordCode | Public | Body: `SendResetPasswordCodeDto` {email} | {success, ...} | Throttle: 3/min |
| POST | `/auth/password/reset/verify-code` | verifyResetPasswordCode | Public | Body: `VerifyResetPasswordCodeDto` {email, code} | {success} | Throttle: 5/min |
| POST | `/auth/password/reset` | resetPassword | Public | Body: `ResetPasswordDto` {email, newPassword} | {success, messageCode} | Throttle: 5/min |
| GET | `/auth/me` | getProfile | JWT | - | AuthProfile | |
| POST | `/auth/refresh` | refreshToken | Public | Header: Bearer (expired token) | {accessToken, ...} | Throttle: 10/min |
| POST | `/auth/logout` | logout | Public | Header: Bearer token | {messageCode} | Throttle: 10/min |
| POST | `/auth/re-register` | reRegister | Public | Body: `ReRegisterDto` {email, password, name} | {messageCode} | Throttle: 5/min. Re-register deleted email account. Separate login required |
| POST | `/auth/re-register/social` | reRegisterSocial | Public | Body: `ReRegisterSocialDto` {email} | {messageCode} | Throttle: 5/min. Re-register deleted social account. Separate login required |

---

### User

Controller: `user/user.controller.ts` | Prefix: `/user` | Auth: JWT (all endpoints)

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| GET | `/user/preferences` | getPreferences | - | {preferences} | |
| POST | `/user/preferences` | upsertPreferences | Body: `UpdatePreferencesDto` {likes?, dislikes?} | {preferences} | Arrays of strings (max 50 items) |
| GET | `/user/address/search` | searchAddress | Query: `SearchAddressDto` {query, language?} | Search results | language: ko/en |
| PATCH | `/user/address` | updateSingleAddress | Body: `UpdateSingleAddressDto` {selectedAddress} | UserAddressResponseDto | Legacy single-address update |
| PATCH | `/user` | updateUser | Body: `UpdateUserDto` {name?, birthDate?, gender?} | {name, birthDate, gender} | |
| DELETE | `/user/me` | deleteCurrentUser | - | {messageCode} | Soft delete |
| PATCH | `/user/language` | updateLanguage | Body: `UpdateLanguageDto` {language} | {messageCode} | language: ko/en |
| GET | `/user/address/default` | getDefaultAddress | - | UserAddressResponseDto or null | |
| GET | `/user/addresses` | getUserAddresses | - | {addresses: UserAddressResponseDto[]} | |
| POST | `/user/addresses` | createUserAddress | Body: `CreateUserAddressDto` {selectedAddress, alias?, isDefault?, isSearchAddress?} | UserAddressResponseDto | |
| PATCH | `/user/addresses/:id` | updateUserAddress | Param: id; Body: `UpdateUserAddressDto` {roadAddress?, latitude?, longitude?, alias?, isDefault?, isSearchAddress?} | UserAddressResponseDto | |
| POST | `/user/addresses/batch-delete` | batchDeleteUserAddresses | Body: `DeleteUserAddressesDto` {ids} | {messageCode} | ids: number[] (1-3 items) |
| PATCH | `/user/addresses/:id/default` | setDefaultAddress | Param: id | UserAddressResponseDto | |
| PATCH | `/user/addresses/:id/search` | setSearchAddress | Param: id | UserAddressResponseDto | |

---

### Menu

Controller: `menu/menu.controller.ts` | Prefix: `/menu` | Auth: JWT (all endpoints)

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| POST | `/menu/recommend` | recommend | Body: `RecommendMenuDto` {prompt} | Menu recommendation | Throttle: 5/min |
| POST | `/menu/selections` | createSelection | Body: `CreateMenuSelectionDto` {menus: [{slot, name}], historyId?} | {selection} | slot: breakfast/lunch/dinner/etc |
| GET | `/menu/selections/history` | getSelections | Query: date? | {selections} | |
| PATCH | `/menu/selections/:id` | updateSelection | Param: id; Body: `UpdateMenuSelectionDto` {breakfast?, lunch?, dinner?, etc?, cancel?} | {selection} | |
| GET | `/menu/recommendations/history` | getHistory | Query: `RecommendationHistoryQueryDto` {page?, limit?, date?} | Paginated history | |
| GET | `/menu/restaurant/blogs` | searchRestaurantBlogs | Query: `SearchRestaurantBlogsDto` {query, restaurantName, language?, searchName?, searchAddress?} | Blog search results | Throttle: 30/min. Google Custom Search |
| GET | `/menu/recommend/places/search` | recommendSearchPlaces | Query: `RecommendCommunityPlacesDto` {latitude, longitude, menuName, menuRecommendationId, language?} | PlaceRecommendationResponse | Throttle: 15/min. Gemini Search+Maps Grounding |
| GET | `/menu/recommend/places/community` | recommendCommunityPlaces | Query: `RecommendCommunityPlacesDto` {latitude, longitude, menuName, menuRecommendationId, language?} | PlaceRecommendationResponse | Community-registered places |
| GET | `/menu/recommend/places/v2` | recommendPlacesV2 | Query: `RecommendPlacesV2Dto` {menuName, address, latitude, longitude, menuRecommendationId, language?} | PlaceRecommendationResponse + searchEntryPointHtml, googleMapsWidgetContextToken | Throttle: 15/min. Gemini V2 |
| GET | `/menu/recommendations/:id` | getRecommendationDetail | Param: id | Recommendation + place details | |
| GET | `/menu/places/:placeId/detail` | getPlaceDetail | Param: placeId | Google Places detail | |
| POST | `/menu/recommend/stream` | recommendStream | Body: `RecommendMenuDto` {prompt} | SSE stream | Throttle: 5/min. Events: retrying, status, result, error |
| GET | `/menu/recommend/places/search/stream` | recommendSearchPlacesStream | Query: `RecommendCommunityPlacesDto` | SSE stream | Throttle: 15/min. Events: retrying, status, result, error |
| GET | `/menu/recommend/places/community/stream` | recommendCommunityPlacesStream | Query: `RecommendCommunityPlacesDto` | SSE stream | Events: retrying, status, result, error |

---

### Rating

Controller: `rating/rating.controller.ts` | Prefix: `/ratings` | Auth: JWT (all endpoints)

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| POST | `/ratings/select` | selectPlace | Body: `SelectPlaceDto` {placeId, placeName, placeRecommendationId?} | Place rating record | |
| GET | `/ratings/pending` | getPendingRating | - | Pending rating or null | |
| POST | `/ratings/submit` | submitRating | Body: `SubmitRatingDto` {placeRatingId, rating} | {success} | rating: 1-5 |
| POST | `/ratings/skip` | skipRating | Body: `SkipRatingDto` {placeRatingId} | {success} | |
| POST | `/ratings/dismiss` | dismissRating | Body: `DismissRatingDto` {placeRatingId} | {success} | |
| GET | `/ratings/history` | getRatingHistory | Query: `GetRatingHistoryDto` {page?, limit?, selectedDate?} | Paginated history | |

---

### Bug Report

Controller: `bug-report/bug-report.controller.ts` | Prefix: `/bug-reports` | Auth: JWT

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| POST | `/bug-reports` | createBugReport | Body: `CreateBugReportDto` {category, title, description}; Files: images (max 5) | {id} | Throttle: 10/min. Multipart/form-data with FilesInterceptor |

---

### User Place

Controller: `user-place/user-place.controller.ts` | Prefix: `/user-places` | Auth: JWT (all endpoints)

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| POST | `/user-places/check` | checkRegistration | Body: `CheckRegistrationDto` {name, address, latitude, longitude} | Registration check result | Rate limited |
| POST | `/user-places` | create | Body: `CreateUserPlaceDto` {name, address, latitude, longitude, menuItems, photos?, businessHours?, phoneNumber?, category?, description?}; Files: images (max 5) | UserPlace + messageCode | Multipart/form-data |
| GET | `/user-places` | findAll | Query: `UserPlaceListQueryDto` {page?, limit?, status?, search?} | Paginated list | |
| GET | `/user-places/:id` | findOne | Param: id | UserPlace detail | |
| PATCH | `/user-places/:id` | update | Param: id; Body: `UpdateUserPlaceDto` {version, name?, address?, latitude?, longitude?, menuItems?, existingPhotos?, businessHours?, phoneNumber?, category?, description?}; Files: images (max 5) | UserPlace + messageCode | Multipart/form-data. Optimistic locking via version |
| DELETE | `/user-places/:id` | remove | Param: id | {messageCode} | |

---

### Notification

Controller: `notification/notification.controller.ts` | Prefix: `/notifications`

> The user-facing notification controller is empty (no endpoints defined).

---

### Admin - Users

Controller: `admin/user/admin-user.controller.ts` | Prefix: `/admin/users` | Auth: JWT + ADMIN/SUPER_ADMIN role

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| GET | `/admin/users` | findAll | Query: `AdminUserListQueryDto` {page?, limit?, search?, sortBy?, sortOrder?, socialType?, status?, role?, startDate?, endDate?} | PaginatedResponse\<AdminUserListItemDto\> | Throttle: 60/min |
| GET | `/admin/users/:id` | findOne | Param: id | AdminUserDetailDto | |
| PATCH | `/admin/users/:id/deactivate` | deactivate | Param: id | {success, messageCode} | Logs IP address |
| PATCH | `/admin/users/:id/activate` | activate | Param: id | {success, messageCode} | Logs IP address |

---

### Admin - Settings

Controller: `admin/settings/admin-settings.controller.ts` | Prefix: `/admin/settings` | Auth: JWT + SUPER_ADMIN only

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| GET | `/admin/settings/admins` | getAdminList | - | AdminListItemDto[] | @SuperAdminOnly |
| POST | `/admin/settings/admins` | promoteToAdmin | Body: `PromoteAdminDto` {userId?, email?, role} | {message} | @SuperAdminOnly. role: ADMIN. Logs IP |
| DELETE | `/admin/settings/admins/:id` | demoteAdmin | Param: id | {message} | @SuperAdminOnly. Logs IP |

---

### Admin - Dashboard

Controller: `admin/dashboard/admin-dashboard.controller.ts` | Prefix: `/admin/dashboard` | Auth: JWT + ADMIN/SUPER_ADMIN role

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| GET | `/admin/dashboard/summary` | getSummary | - | DashboardSummaryResponseDto | Throttle: 60/min |
| GET | `/admin/dashboard/recent-activities` | getRecentActivities | - | RecentActivitiesResponseDto | |
| GET | `/admin/dashboard/trends` | getTrends | Query: `TrendsQueryDto` {period?, type?} | TrendsResponseDto | period: 7d/30d/90d; type: users/recommendations/all |

---

### Admin - Bug Reports

Controller: `bug-report/controllers/admin-bug-report.controller.ts` | Prefix: `/admin/bug-reports` | Auth: JWT + ADMIN/SUPER_ADMIN role

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| GET | `/admin/bug-reports` | findAll | Query: `BugReportListQueryDto` {page?, limit?, status?, date?, category?, search?} | Paginated list | Throttle: 60/min. status: BugReportStatus enum |
| GET | `/admin/bug-reports/:id` | findOne | Param: id | Bug report with details/history | |
| PATCH | `/admin/bug-reports/:id/status` | updateStatus | Param: id; Body: `UpdateBugReportStatusDto` {status} | Updated bug report | |

---

### Admin - User Places

Controller: `user-place/controllers/admin-user-place.controller.ts` | Prefix: `/admin/user-places` | Auth: JWT + ADMIN/SUPER_ADMIN role

| Method | Path | Handler | Request | Response | Notes |
|--------|------|---------|---------|----------|-------|
| GET | `/admin/user-places` | findAll | Query: `AdminUserPlaceListQueryDto` {page?, limit?, status?, userId?, search?} | Paginated list | Throttle: 60/min |
| GET | `/admin/user-places/:id` | findOne | Param: id | UserPlace detail (admin view) | |
| PATCH | `/admin/user-places/:id/approve` | approve | Param: id | Approved place | Logs IP |
| PATCH | `/admin/user-places/:id/reject` | reject | Param: id; Body: `RejectUserPlaceDto` {reason} | Rejected place | reason: 10-500 chars. Logs IP |
| PATCH | `/admin/user-places/:id` | update | Param: id; Body: `UpdateUserPlaceByAdminDto` {version?, name?, address?, ...}; Files: images (max 5) | Updated place | Multipart/form-data. Logs IP |

---

<!-- TODO: Admin Notification 기능 구현 후 추가 예정 (5 endpoints: CRUD + list) -->

---

## Endpoint Summary

| Section | Count |
|---------|-------|
| Auth | 16 |
| User | 14 |
| Menu | 14 |
| Rating | 6 |
| Bug Report | 1 |
| User Place | 6 |
| Notification (user) | 0 |
| Admin - Users | 4 |
| Admin - Settings | 3 |
| Admin - Dashboard | 3 |
| Admin - Bug Reports | 3 |
| Admin - User Places | 5 |
| **Total** | **75** |

## SSE Streaming Endpoints

Three endpoints support Server-Sent Events (SSE) for real-time streaming:

| Endpoint | Description |
|----------|-------------|
| `POST /menu/recommend/stream` | Menu recommendation with retry/status events |
| `GET /menu/recommend/places/search/stream` | Search-based place recommendation streaming |
| `GET /menu/recommend/places/community/stream` | Community place recommendation streaming |

**SSE Event Types:**
- `retrying` - Retry attempt notification (includes attempt number)
- `status` - Status update (e.g., "searching")
- `result` - Final result data
- `error` - Error with message and optional errorCode

## File Upload Endpoints

Four endpoints accept multipart/form-data with image uploads (max 5 files):

| Endpoint | Field Name | Validation |
|----------|------------|------------|
| `POST /bug-reports` | `images` | ImageValidationPipe |
| `POST /user-places` | `images` | ImageValidationPipe |
| `PATCH /user-places/:id` | `images` | ImageValidationPipe |
| `PATCH /admin/user-places/:id` | `images` | ImageValidationPipe |

## Rate Limiting

Global throttle is applied per-endpoint. Key limits:

| Limit | Endpoints |
|-------|-----------|
| 3/min | Email send-code, password reset send-code |
| 5/min | Register, re-register, email verify, password reset, menu recommend |
| 10/min | Login, social login, check-email, refresh, logout, bug report create |
| 15/min | Place recommendation (search, v2) |
| 30/min | Restaurant blog search |
| 60/min | All admin endpoints |
