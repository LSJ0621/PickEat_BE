# Database Schema

## Entity Relationship Diagram

![ERD](images/pickeat_erd_dark.png)

---

## Tables

### User

**Table name:** `user`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| email | varchar | NO | - | Unique email address |
| password | varchar | YES | NULL | Hashed password (null for social login users) |
| socialId | varchar | YES | NULL | Social provider user ID |
| socialType | varchar | YES | NULL | Social login provider (e.g., kakao, google) |
| name | varchar | YES | NULL | Display name |
| birthDate | varchar(10) | YES | NULL | Birth date string |
| gender | varchar(10) | YES | NULL | Gender: 'male', 'female', 'other' |
| role | varchar | NO | 'USER' | User role (USER, ADMIN, SUPER_ADMIN) |
| preferences | jsonb | YES | NULL | User food preferences (UserPreferences) |
| preferredLanguage | varchar | NO | 'ko' | UI language: 'ko' or 'en' |
| emailVerified | boolean | NO | false | Whether email is verified |
| reRegisterEmailVerified | boolean | NO | false | Email verified for re-registration |
| lastPasswordChangedAt | timestamptz | YES | NULL | Last password change timestamp |
| is_deactivated | boolean | NO | false | Account deactivation flag |
| deactivated_at | timestamp | YES | NULL | When account was deactivated |
| last_active_at | timestamp | YES | NULL | Last user activity timestamp |
| last_login_at | timestamp | YES | NULL | Last login timestamp |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |
| version | integer | NO | 1 | Optimistic locking version |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |

**Relationships:**
- OneToMany -> UserAddress (cascade)
- OneToMany -> MenuRecommendation
- OneToMany -> MenuSelection
- OneToOne -> UserTasteAnalysis

**Indexes:**
- `idx_user_role` (role)
- `idx_user_social_type` (socialType)
- `idx_user_deactivated` (isDeactivated)
- `idx_user_deleted_deactivated` (deletedAt, isDeactivated)
- UNIQUE (email)

---

### UserAddress

**Table name:** `user_address`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE) |
| roadAddress | varchar | NO | - | Road address (from Kakao API) |
| postalCode | varchar | YES | NULL | Postal code |
| latitude | decimal(10,7) | NO | - | Latitude coordinate |
| longitude | decimal(10,7) | NO | - | Longitude coordinate |
| isDefault | boolean | NO | false | Default address flag (shown in My Page) |
| isSearchAddress | boolean | NO | false | Search address flag (used for menu recommendation) |
| alias | varchar | YES | NULL | Address alias (e.g., "Home", "Office") |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (onDelete: CASCADE)

**Indexes:**
- `idx_user_address_default` (user, isDefault)
- `idx_user_address_search` (user, isSearchAddress)

---

### UserTasteAnalysis

**Table name:** `user_taste_analysis`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE), unique |
| stablePatterns | jsonb | YES | NULL | Long-term taste patterns: categories, flavors, cookingMethods, confidence |
| recentSignals | jsonb | YES | NULL | Recent taste changes: trending, declining |
| diversityHints | jsonb | YES | NULL | Diversity suggestions: explorationAreas, rotationSuggestions |
| compactSummary | text | YES | NULL | Concise summary for menu recommendation API (under 100 chars) |
| analysisParagraphs | jsonb | YES | NULL | 3-paragraph structured taste analysis (AnalysisParagraphs) |
| analysisVersion | integer | NO | 1 | Analysis version number |
| lastAnalyzedAt | timestamptz | NO | - | When the analysis was last performed |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- OneToOne -> User (onDelete: CASCADE, JoinColumn: userId)

**Indexes:**
- `idx_taste_analysis_user_id` (userId) UNIQUE
- `idx_taste_analysis_last_analyzed_at` (lastAnalyzedAt)

---

### MenuRecommendation

**Table name:** `menu_recommendation`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE) |
| recommendations | text[] | NO | - | Array of recommended menu names |
| intro | text | NO | '' | Introduction text from AI |
| closing | text | NO | '' | Closing text from AI |
| recommendationDetails | jsonb | YES | NULL | Array of {condition, menu} detail objects |
| prompt | text | NO | - | GPT prompt used for this recommendation |
| requestAddress | text | NO | - | User address at time of request |
| region | varchar(20) | YES | NULL | Region name extracted from requestAddress |
| recommendedAt | timestamptz | NO | - | When the recommendation was generated |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (onDelete: CASCADE)
- OneToMany -> PlaceRecommendation
- OneToMany -> MenuSelection

**Indexes:**
- `idx_menu_recommendation_user_date` (user, recommendedAt)
- `idx_menu_recommendation_region` (region)
- `idx_menu_recommendation_created_at` (createdAt)

---

### MenuSelection

**Table name:** `menu_selection`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE) |
| menuRecommendationId | integer | YES | NULL | FK -> MenuRecommendation.id (SET NULL) |
| batchJobId | integer | YES | NULL | FK -> BatchJob.id (SET NULL) |
| menuPayload | jsonb | NO | - | Selected menu slot data (MenuSlotPayload) |
| status | enum(MenuSelectionStatus) | NO | 'PENDING' | Processing status |
| selectedAt | timestamptz | NO | CURRENT_TIMESTAMP | When the selection was made |
| selectedDate | date | NO | CURRENT_DATE | Date of selection (one per user per day) |
| retryCount | integer | NO | 0 | Batch retry count (max 3) |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| version | integer | NO | 1 | Optimistic locking version |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (onDelete: CASCADE)
- ManyToOne -> MenuRecommendation (onDelete: SET NULL)
- ManyToOne -> BatchJob (onDelete: SET NULL)

**Indexes:**
- `idx_menu_selection_status` (status)
- `idx_menu_selection_batch_job_id` (batchJobId)
- UNIQUE `UQ_menu_selection_user_date` (user, selectedDate)

---

### PlaceRecommendation

**Table name:** `place_recommendation`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| menuRecommendationId | integer | NO | - | FK -> MenuRecommendation.id (CASCADE) |
| placeId | varchar(255) | NO | - | Google Places ID |
| reason | text | NO | - | Recommendation reason text |
| reasonTags | jsonb | NO | [] | Array of reason tag strings |
| menuName | text | YES | NULL | Specific menu item name |
| source | enum(PlaceRecommendationSource) | NO | 'GOOGLE' | Data source |
| userPlaceId | integer | YES | NULL | FK -> UserPlace.id (SET NULL) |
| nameKo | varchar(500) | YES | NULL | Place name in Korean |
| nameEn | varchar(500) | YES | NULL | Place name in English |
| nameLocal | varchar(500) | YES | NULL | Place name in local language |
| addressKo | text | YES | NULL | Address in Korean |
| addressEn | text | YES | NULL | Address in English |
| addressLocal | text | YES | NULL | Address in local language |
| placeLatitude | decimal(10,6) | YES | NULL | Place latitude |
| placeLongitude | decimal(11,7) | YES | NULL | Place longitude |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> MenuRecommendation (onDelete: CASCADE)
- ManyToOne -> UserPlace (onDelete: SET NULL)

**Indexes:**
- `idx_place_recommendation_menu` (menuRecommendation)
- `idx_place_recommendation_source` (source)
- `idx_place_recommendation_user_place` (userPlace)

---

### PlaceRating

**Table name:** `place_rating`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE) |
| placeId | varchar(255) | NO | - | Google Places ID |
| placeName | varchar(200) | NO | - | Place display name |
| placeRecommendationId | integer | YES | NULL | FK -> PlaceRecommendation.id (SET NULL) |
| rating | integer | YES | NULL | User rating value |
| skipped | boolean | NO | false | Whether user skipped rating |
| promptDismissed | boolean | NO | false | Whether rating prompt was dismissed |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (onDelete: CASCADE)
- ManyToOne -> PlaceRecommendation (onDelete: SET NULL)

**Indexes:**
- `idx_place_rating_user_pending` (user, rating, skipped, promptDismissed)
- `idx_place_rating_place_id` (placeId)

---

### UserPlace

**Table name:** `user_place`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE) |
| name | varchar(100) | NO | - | Place name |
| address | varchar(500) | NO | - | Place address |
| latitude | decimal(10,7) | NO | - | Latitude coordinate |
| longitude | decimal(10,7) | NO | - | Longitude coordinate |
| location | geography(Point, 4326) | YES | NULL | PostGIS geography point for spatial queries |
| menuItems | jsonb | NO | [] | Array of menu items (MenuItem[]) |
| photos | simple-array | YES | NULL | Photo URL array |
| businessHours | jsonb | YES | NULL | Business hours data (BusinessHours) |
| phoneNumber | varchar(20) | YES | NULL | Contact phone number |
| category | varchar(50) | YES | NULL | Place category |
| description | text | YES | NULL | Place description |
| status | enum(UserPlaceStatus) | NO | 'PENDING' | Approval status |
| rejectionReason | text | YES | NULL | Reason for rejection |
| rejectionCount | integer | NO | 0 | Number of times rejected |
| lastRejectedAt | timestamptz | YES | NULL | Last rejection timestamp |
| lastSubmittedAt | timestamptz | YES | NULL | Last submission timestamp |
| averageRating | decimal(2,1) | NO | 0 | Average user rating |
| ratingCount | integer | NO | 0 | Total number of ratings |
| version | integer | NO | 1 | Optimistic locking version |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deleted_at | timestamp | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (onDelete: CASCADE)

**Indexes:**
- `idx_user_place_user_status` (user, status)
- `idx_user_place_created_at` (createdAt)
- `idx_user_place_location` (location) - Spatial index (manual sync)

---

### UserPlaceRejectionHistory

**Table name:** `user_place_rejection_history`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userPlaceId | integer | NO | - | FK -> UserPlace.id (CASCADE) |
| adminId | integer | NO | - | FK -> User.id (RESTRICT) |
| reason | text | NO | - | Rejection reason |
| rejected_at | timestamp | NO | CURRENT_TIMESTAMP | When the rejection occurred |

**Relationships:**
- ManyToOne -> UserPlace (onDelete: CASCADE)
- ManyToOne -> User (admin, onDelete: RESTRICT)

**Indexes:**
- `idx_user_place_rejection_history_user_place` (userPlace)
- `idx_user_place_rejection_history_admin` (admin)

---

### EmailVerification

**Table name:** `email_verifications`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| email | varchar | NO | - | Email address to verify |
| codeHash | varchar | NO | - | Hashed verification code |
| purpose | varchar | YES | NULL | Verification purpose (SIGNUP, RE_REGISTER, PASSWORD_RESET) |
| expiresAt | timestamp | NO | - | Code expiration time |
| used | boolean | NO | false | Whether code has been used |
| usedAt | timestamp | YES | NULL | When code was used |
| status | varchar(20) | NO | 'ACTIVE' | Status: ACTIVE, USED, INVALIDATED, EXPIRED |
| sendCount | integer | NO | 0 | Number of times code was sent |
| lastSentAt | timestamp | YES | NULL | Last send timestamp |
| failCount | integer | NO | 0 | Number of failed verification attempts |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:** None

**Indexes:**
- Index on `email`

---

### Notification

**Table name:** `notification`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| type | enum(NotificationType) | NO | - | Notification category |
| title | varchar(100) | NO | - | Notification title |
| content | text | NO | - | Notification body content |
| status | enum(NotificationStatus) | NO | 'DRAFT' | Publication status |
| isPinned | boolean | NO | false | Whether notification is pinned to top |
| viewCount | integer | NO | 0 | Number of views |
| scheduledAt | timestamptz | YES | NULL | Scheduled publish time |
| publishedAt | timestamptz | YES | NULL | Actual publish time |
| createdById | integer | NO | - | FK -> User.id (CASCADE), auto-generated from ManyToOne `createdBy` relation |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamptz | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (createdBy, onDelete: CASCADE)

**Indexes:**
- `idx_notification_status` (status)
- `idx_notification_type` (type)
- `idx_notification_pinned_published` (isPinned, publishedAt)

---

### BugReport

**Table name:** `bug_report`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| userId | integer | NO | - | FK -> User.id (CASCADE) |
| category | varchar(50) | NO | - | Bug category |
| title | varchar(30) | NO | - | Bug report title |
| description | text | NO | - | Detailed description |
| images | jsonb | YES | NULL | Array of image URLs |
| status | enum(BugReportStatus) | NO | 'UNCONFIRMED' | Report status |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |
| deletedAt | timestamp | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> User (onDelete: CASCADE)

**Indexes:**
- `idx_bug_report_status_date` (status, createdAt)
- `idx_bug_report_user` (user)

---

### BugReportAdminNote

**Table name:** `bug_report_admin_note`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| bug_report_id | integer | NO | - | FK -> BugReport.id (CASCADE) |
| content | text | NO | - | Admin note content |
| created_by_id | integer | YES | NULL | FK -> User.id (SET NULL) |
| created_at | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| deleted_at | timestamp | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> BugReport (onDelete: CASCADE)
- ManyToOne -> User (createdBy, onDelete: SET NULL)

**Indexes:**
- `idx_bug_report_admin_note_bug_report` (bugReport)
- `idx_bug_report_admin_note_created_by` (createdBy)

---

### BugReportStatusHistory

**Table name:** `bug_report_status_history`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| bug_report_id | integer | NO | - | FK -> BugReport.id (CASCADE) |
| previous_status | varchar(20) | NO | - | Status before the change |
| status | varchar(20) | NO | - | New status after the change |
| changed_by_id | integer | YES | NULL | FK -> User.id (SET NULL) |
| changed_at | timestamp | NO | CURRENT_TIMESTAMP | When the status change occurred |
| deleted_at | timestamp | YES | NULL | Soft delete timestamp |

**Relationships:**
- ManyToOne -> BugReport (onDelete: CASCADE)
- ManyToOne -> User (changedBy, onDelete: SET NULL)

**Indexes:**
- `idx_bug_report_status_history_bug_report` (bugReport)
- `idx_bug_report_status_history_changed_by` (changedBy)

---

### BugReportNotification

**Table name:** `bug_report_notification`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| unconfirmedCount | integer | NO | - | Number of unconfirmed bug reports at notification time |
| threshold | integer | NO | - | Threshold level that triggered notification (10, 20, 30, 50, 100) |
| sentAt | timestamp | NO | CURRENT_TIMESTAMP | When the notification was sent |

**Relationships:** None

**Indexes:**
- `idx_bug_report_notification_threshold_sent` (threshold, sentAt)

---

### BatchJob

**Table name:** `batch_job`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto-increment | PK |
| type | enum(BatchJobType) | NO | - | Job type |
| status | enum(BatchJobStatus) | NO | 'PENDING' | Job processing status |
| openAiBatchId | varchar(100) | YES | NULL | OpenAI batch ID (batch_xxx) |
| inputFileId | varchar(100) | YES | NULL | OpenAI input file ID (file_xxx) |
| outputFileId | varchar(100) | YES | NULL | OpenAI output file ID (file_xxx) |
| errorFileId | varchar(100) | YES | NULL | OpenAI error file ID (file_xxx) |
| totalRequests | integer | NO | 0 | Total number of requests in batch |
| completedRequests | integer | NO | 0 | Number of completed requests |
| failedRequests | integer | NO | 0 | Number of failed requests |
| submittedAt | timestamptz | YES | NULL | When batch was submitted to OpenAI |
| completedAt | timestamptz | YES | NULL | When batch processing completed |
| errorMessage | text | YES | NULL | Error message if failed |
| createdAt | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| updatedAt | timestamp | NO | CURRENT_TIMESTAMP | Last update time |

**Relationships:** None

**Indexes:**
- `idx_batch_job_status` (status)
- `idx_batch_job_type_status` (type, status)
- `idx_batch_job_openai_batch_id` (openAiBatchId)

---

### AdminAuditLog

**Table name:** `admin_audit_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| admin_id | integer | NO | - | FK -> User.id (SET NULL), dual definition: ManyToOne `admin` relation + explicit `@Column() adminId` |
| action | varchar(50) | NO | - | Action performed |
| target | varchar(100) | YES | NULL | Target entity/resource |
| previous_value | jsonb | YES | NULL | Value before the change |
| new_value | jsonb | YES | NULL | Value after the change |
| ip_address | varchar(45) | NO | - | Admin's IP address |
| created_at | timestamp | NO | CURRENT_TIMESTAMP | When the action occurred |

**Relationships:**
- ManyToOne -> User (admin, onDelete: SET NULL)

**Indexes:**
- `idx_audit_log_admin_action` (adminId, action)
- `idx_audit_log_created_at` (createdAt)

---

## Enums

### MenuSelectionStatus
Defined in: `src/menu/entities/menu-selection.entity.ts`

| Value | Description |
|-------|-------------|
| PENDING | Initial state, awaiting processing |
| IN_PROGRESS | Currently being processed |
| BATCH_PROCESSING | Submitted to OpenAI Batch API |
| SUCCEEDED | Successfully processed |
| FAILED | Processing failed (retryable) |
| CANCELLED | Cancelled by user or system |
| PERMANENTLY_FAILED | Failed after max retries |

### BatchJobType
Defined in: `src/batch/types/preference-batch.types.ts`

| Value | Description |
|-------|-------------|
| PREFERENCE_ANALYSIS | User taste preference analysis job |

### BatchJobStatus
Defined in: `src/batch/types/preference-batch.types.ts`

| Value | Description |
|-------|-------------|
| PENDING | Job created, not yet submitted |
| SUBMITTED | Submitted to OpenAI |
| PROCESSING | Being processed by OpenAI |
| COMPLETED | Successfully completed |
| FAILED | Processing failed |
| EXPIRED | Job expired |

### NotificationType
Defined in: `src/notification/enum/notification-type.enum.ts`

| Value | Description |
|-------|-------------|
| NOTICE | General notice |
| UPDATE | App/service update |
| EVENT | Event announcement |
| MAINTENANCE | Maintenance notice |

### NotificationStatus
Defined in: `src/notification/enum/notification-status.enum.ts`

| Value | Description |
|-------|-------------|
| DRAFT | Not yet published |
| SCHEDULED | Scheduled for future publication |
| PUBLISHED | Currently published and visible |

### BugReportStatus
Defined in: `src/bug-report/enum/bug-report-status.enum.ts`

| Value | Description |
|-------|-------------|
| UNCONFIRMED | Newly reported, not yet reviewed |
| CONFIRMED | Reviewed and confirmed as a bug |
| FIXED | Bug has been resolved |

### PlaceRecommendationSource
Defined in: `src/menu/enum/place-recommendation-source.enum.ts`

| Value | Description |
|-------|-------------|
| GOOGLE | From Google Places API |
| USER | User-submitted place |
| GEMINI | From Gemini AI recommendation |

### UserPlaceStatus
Defined in: `src/user-place/enum/user-place-status.enum.ts`

| Value | Description |
|-------|-------------|
| PENDING | Awaiting admin approval |
| APPROVED | Approved and active |
| REJECTED | Rejected by admin |

### EmailVerificationStatus
Defined in: `src/auth/entities/email-verification.entity.ts` (type alias)

| Value | Description |
|-------|-------------|
| ACTIVE | Code is valid and usable |
| USED | Code has been consumed |
| INVALIDATED | Code was invalidated (e.g., new code issued) |
| EXPIRED | Code has expired |

---

## Common Patterns

### Timestamps (createdAt / updatedAt)
Most entities include TypeORM's `@CreateDateColumn()` and `@UpdateDateColumn()` decorators, which automatically set timestamps on insert and update respectively. These columns are present on all entities except `BugReportNotification` (only has `sentAt`), `UserPlaceRejectionHistory` (only has `rejectedAt`), `AdminAuditLog` (only has `createdAt`), `BugReportAdminNote` (only has `createdAt`), and `BugReportStatusHistory` (only has `changedAt`).

### Soft Delete
The majority of entities implement soft delete via TypeORM's `@DeleteDateColumn()`. When a record is "deleted," the `deletedAt` column is set instead of removing the row. Entities **without** soft delete:
- `BugReportNotification` (append-only notification log)
- `BatchJob` (job records are preserved)
- `AdminAuditLog` (audit trail, never deleted)
- `UserPlaceRejectionHistory` (rejection history, never deleted)

### Optimistic Locking (Version Column)
Three entities use `@VersionColumn()` for optimistic concurrency control:
- `User` (version)
- `MenuSelection` (version)
- `UserPlace` (version)

TypeORM automatically increments the version on each update and throws an error if a concurrent modification is detected.

### UUID Primary Keys
Most entities use auto-incrementing integer PKs. Three entities use UUID PKs:
- `BugReportAdminNote` (uuid)
- `BugReportStatusHistory` (uuid)
- `AdminAuditLog` (uuid)

### JSONB Columns
PostgreSQL JSONB is used extensively for flexible/nested data:
- `User.preferences` - Food preferences
- `UserTasteAnalysis.stablePatterns` / `recentSignals` / `diversityHints` / `analysisParagraphs` - AI-generated taste analysis
- `MenuRecommendation.recommendationDetails` - Detailed recommendation context
- `MenuSelection.menuPayload` - Selected menu slot data
- `PlaceRecommendation.reasonTags` - Tag array
- `BugReport.images` - Image URL array
- `UserPlace.menuItems` / `businessHours` - Place details
- `AdminAuditLog.previousValue` / `newValue` - Change tracking

### Cascade Deletes
Foreign key cascade behaviors follow a consistent pattern:
- **CASCADE**: Used when child records have no meaning without the parent (e.g., UserAddress -> User, MenuRecommendation -> User)
- **SET NULL**: Used when the child record should be preserved but the reference cleared (e.g., MenuSelection -> MenuRecommendation, PlaceRecommendation -> UserPlace)
- **RESTRICT**: Used when deletion should be blocked (e.g., UserPlaceRejectionHistory -> admin User)

### Spatial Data
`UserPlace` uses PostGIS `geography(Point, 4326)` type with a spatial index for location-based queries. The `location` column stores a GeoJSON Point derived from latitude/longitude.
