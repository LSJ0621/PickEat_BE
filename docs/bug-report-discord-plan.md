# 버그 신고 기능 설계 (유저/관리자 전용 뷰 포함)

> 작성일: 2025-12  
> 목표: **유저가 카테고리/제목/상세 내용/이미지를 포함해 버그를 제보**하고,  
> **본인은 마이페이지에서 본인 제보만 조회**, **관리자는 전체 제보를 조회/관리**할 수 있는 기능을 제공

---

## 📋 목차

1. [배경 및 목표](#-배경-및-목표)
2. [기능 요구사항](#-기능-요구사항)
3. [API 및 도메인 설계](#-api-및-도메인-설계)
4. [Discord Webhook 연동 설계](#-discord-webhook-연동-설계)
5. [유효성 검증 및 악용 방지](#-유효성-검증-및-악용-방지)
6. [에러 처리 및 로깅](#-에러-처리-및-로깅)
7. [환경 변수 및 설정](#-환경-변수-및-설정)
8. [테스트 및 검증 계획](#-테스트-및-검증-계획)
9. [구현 단계 계획](#-구현-단계-계획)

---

## 🎯 배경 및 목표

### 배경
- 현재 서비스에는 **유저가 직접 버그를 제보하고 추후 상태를 확인할 수 있는 공간**이 없다.
- 버그 제보가 카카오톡/디스코드 DM 등 비정형 채널로 흩어져,  
  **누가 어떤 버그를 언제 제보했고, 지금 상태가 어떤지 추적하기 어렵다.**
- 운영/개발 측에서는 **이미지, 상세 설명, 페이지 정보** 등이 포함된 구조화된 버그 데이터를 원한다.

### 목표
- 로그인한 유저가 **카테고리/제목/상세 내용/이미지**를 포함해 쉽게 버그를 제보할 수 있도록 한다.
- 유저는 **마이페이지에서 “내가 작성한 버그 제보 목록 및 상태”**를 확인할 수 있다.
- 관리자는 **모든 버그 제보 목록과 상세 정보를 조회**하고,  
  **제보 상태를 변경(미확인/확인/수정 완료)**하며,  
  각 제보에 대해 **유저에게 보여줄 안내 문구(관리자 답변)를 작성**할 수 있다.
- 버그 제보 내용과 이미지는 **자체 DB + 스토리지(S3 등)**에 안전하게 저장하여 이후 분석/검색이 가능하도록 한다.

---

## 📦 기능 요구사항

### 1) 유저 기능 요구사항

- **버그 제보 작성**
  - 로그인한 유저만 버그 제보 작성 가능.
  - 유저가 입력/선택할 필드:
    - `category`: 버그 유형 선택 (예: UI, 기능, 성능, 기타) – 추후 enum 확장 가능.
    - `title`: 버그 제목 / 한 줄 요약 (필수).
    - `description`: 상세 내용 (필수).
    - `images`: 버그 관련 스크린샷/이미지 첨부 (**0~5장**, 선택).
  - 제보 생성 시, 서버는 추가로 다음 정보를 함께 저장:
    - 제보자 `userId`
    - 생성 시각(`createdAt`), 업데이트 시각(`updatedAt`)
  - 유저는 **본인이 작성한 버그 제보를 직접 조회하는 기능은 제공하지 않고**,  
    버그 제보는 **관리자용 내부 관리용 데이터**로만 사용한다.

### 2) 관리자 기능 요구사항

- **버그 제보 목록 조회 (Pagination 필수)**
  - 관리자는 **모든 유저의 버그 제보 목록**을 조회할 수 있다.
  - 목록은 기본적으로 **Pagination**이 적용되어야 한다.
    - 요청 파라미터: `page`, `limit` (구체 값/제한은 추후 DTO 설계에서 정의).
  - 기본 정렬: **최신 생성 순(desc)**.

- **초기 진입 시 기본 목록**
  - 관리자가 버그 제보 리스트 화면에 처음 진입했을 때,
    - 기본으로 **상태가 “미확인”인 버그 제보들**만 보여준다.

- **상태/날짜/전체 필터링**
  - 관리자는 다음과 같은 방식으로 목록을 필터링할 수 있다:
    - **상태별 필터**
      - `미확인` 상태만 보기
      - `확인` 상태만 보기
    - **날짜 필터**
      - 특정 날짜(또는 날짜 범위)의 제보 내역 조회
    - **전체 보기**
      - 상태/날짜 필터를 모두 해제하고, 전체 제보 내역 조회

- **버그 제보 상세 조회**
  - 관리자용 상세 화면에서는 다음을 확인 가능:
    - 유저가 작성한 모든 필드(카테고리/제목/상세/이미지)
    - 제보자의 기본 정보(userId, 닉네임/이메일 등 필요 시)
    - 생성 시각(`createdAt`), 업데이트 시각(`updatedAt`)

- **제보 상태 변경 (관리자 액션 기반)**
  - 각 제보는 다음 두 가지 상태를 가진다:
    - `미확인`: 기본 상태 (등록 직후)
    - `확인`: 관리자가 제보 내용을 확인한 상태
  - 상태 변경 규칙:
    - 상태는 **관리자 액션에 의해서만** 변경된다.
    - 유저가 직접 상태를 변경할 수 있는 경로는 없다.
    - 관리자는 상세 화면 또는 목록 화면의 액션 버튼 등을 통해  
      `미확인 → 확인` 으로 상태를 변경할 수 있다.

### 3) 공통/비기능 요구사항 (요구사항 레벨)

- **권한/접근 제어**
  - 버그 제보 생성:
    - 로그인한 유저만 가능.
  - 버그 제보 조회:
    - **관리자만** 목록/상세 조회 가능.
    - 일반 유저는 어떤 경로로도 버그 제보 목록/상세를 조회할 수 없다.

- **알림 (Discord Webhook)**
  - "미확인" 상태의 버그 제보 개수가 **10개 이상**일 때,  
    디스코드로 **관리자 알림**이 전송되어야 한다.
    - 구현 시점 기준으로, 스케줄러를 통해 주기적으로 미확인 개수를 체크하는 방식으로 구현.
    - **참고**: 중복 알림 방지 기능은 Redis 도입 후 추후 추가 예정.
  - Discord Webhook URL은 `.env`로 관리하며, `ConfigModule` + `env.validation`으로 검증한다.
  - 알림 포맷/채널은 내부 운영용으로 사용하기 쉽게 최소한의 정보(미확인 개수, 최근 제보 요약 등)를 포함하도록 설계한다.

- **데이터 저장**
  - 버그 제보 본문과 메타데이터는 DB에 저장:
    - 카테고리, 제목, 상세 내용, 상태(미확인/확인), 생성/업데이트 시각 등.
  - 이미지 파일은 S3 등 외부 스토리지에 저장하고,
    - DB에는 **이미지 URL만** 저장한다.

- **보안/프라이버시**
  - 버그 제보 내용/이미지에는 개인정보가 포함될 수 있으므로,
    - 외부 공유가 아닌 **내부 전용 데이터**로 취급한다.
    - URL/이미지 접근 권한은 적절히 제한하는 방향으로 설계(추후 상세 설계).

---

## 🧩 API 및 도메인 설계

### 엔드포인트
- **URL**: `POST /feedback/bugs`
- **인증**: 없음 (비로그인 가능)
- **Throttle/Rate Limit**: 추후 `@UseGuards(ThrottlerGuard)` 또는 전용 Guard 적용 여지 남김.

### Request Body (DTO 초안)
**파일 위치(예정)**: `src/feedback/dto/create-bug-report.dto.ts`

```typescript
export class CreateBugReportDto {
  // 버그 제목 (한 줄 요약)
  title: string;

  // 상세 설명 (최소 길이 지정)
  description: string;

  // 버그가 발생한 페이지 URL (optional)
  pageUrl?: string;

  // 연락 가능 정보 (optional)
  contact?: string;
}
```

> 실제 구현 시 `class-validator` 데코레이터 (예: `@IsString()`, `@IsNotEmpty()`, `@MaxLength()` 등)와  
> DTO/Entity 규칙에 맞는 파일 위치/네이밍을 적용한다.

### Controller / Service 구조

- **모듈 (예정)**: `FeedbackModule`
  - 위치: `src/feedback/feedback.module.ts`

- **컨트롤러 (예정)**: `FeedbackController`
  - 위치: `src/feedback/feedback.controller.ts`
  - 책임:
    - `POST /feedback/bugs` 요청 수신.
    - DTO 바인딩 및 Validation Pipe 처리.
    - 요청에서 **IP, User-Agent** 등 헤더 정보를 추출하여 Service로 전달.

- **서비스 (예정)**: `FeedbackService`
  - 위치: `src/feedback/services/feedback.service.ts`
  - 책임:
    - 버그 신고 도메인 로직 처리.
    - Discord Webhook에 전달할 메시지 Payload 조합.
    - Discord Webhook Client 호출.
    - 필요 시 간단한 방어 로직(예: 너무 짧은 description 거절 등).

---

## 🌐 Discord Webhook 연동 설계

### 외부 API 클라이언트 구조

**모듈 구조(예정)**:
- `src/external/discord/discord.constants.ts`
- `src/external/discord/discord.types.ts`
- `src/external/discord/clients/discord-webhook.client.ts`

### constants 설계

**`discord.constants.ts` (초안)**:
- 환경변수 키 정의
  - `DISCORD_BUG_REPORT_WEBHOOK_URL`
- 디스코드 메시지 포맷에 사용할 기본 상수
  - 버그 리포트용 채널 이름/타이틀, 색상 코드 등 (하드코딩 X, 상수화)

### types 설계

**`discord.types.ts` (초안)**:
- Discord Webhook Request 타입 정의
  - `DiscordWebhookPayload`
    - `content?: string`
    - `embeds?: DiscordEmbed[]`
  - `DiscordEmbed`
    - `title?: string`
    - `description?: string`
    - `fields?: { name: string; value: string; inline?: boolean }[]`
    - `timestamp?: string`
    - `color?: number`

> any 사용 금지, 필요한 최소 필드만 엄격하게 타입으로 정의.

### 클라이언트 설계

**`clients/discord-webhook.client.ts` (초안)**:
- 책임:
  - ConfigService를 통해 `DISCORD_BUG_REPORT_WEBHOOK_URL`를 `getOrThrow()`로 로드.
  - Axios 또는 HttpService를 사용해 Discord Webhook Endpoint로 POST.
  - 외부 API 실패 시 공통 규칙에 따라 **커스텀 예외(ExternalApiException 계열)**를 throw.
  - Logger를 통해 에러 및 응답 상태 로깅.

- 메서드 예시:
  - `sendBugReport(payload: DiscordWebhookPayload): Promise<void>`

> Service에서는 HTTP/헤더/URL을 전혀 알지 못하고, **오직 클라이언트 메서드만 호출**하도록 유지.

---

## 🛡 유효성 검증 및 악용 방지

### DTO 검증
- `class-validator`로 다음 규칙 적용:
  - `title`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`
  - `description`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(2000)`
  - `pageUrl`: `@IsOptional()`, `@IsString()`, 필요 시 URL 패턴 검증
  - `contact`: `@IsOptional()`, `@IsString()`, `@MaxLength(100)`

### Rate Limiting (선택적/향후)
- 1차 구현에서는 우선 기능을 제공하고, Abuse 패턴이 보이면 이후 단계에서 적용:
  - IP 기반 Rate Limiting
  - 동일 내용 반복 신고 차단 로직 등

### XSS/Injection 방어
- Discord Webhook으로 전송되는 내용은 그대로 UI에 렌더링되지 않지만,
  - 코드 블럭, 멘션(@everyone 등) 악용 가능성을 고려해 **특수 패턴은 escape**하는 유틸 함수 도입 여지.

---

## 🧱 에러 처리 및 로깅

### 에러 처리 원칙
- 모든 예외는 기존 규칙에 따라 **전역 Exception Filter**에서 처리.
- 서비스/클라이언트에서는:
  - 유효하지 않은 입력 → `BadRequestException`
  - 외부 API(Discord) 실패 → `ExternalApiException` (또는 기존 커스텀 예외 상속)

### 로깅
- Discord 전송 실패 시:
  - Logger를 통해 **요약 정보만** 로그:
    - 에러 타입, HTTP status, Discord 응답 body 일부
    - 유저가 입력한 원문 전체를 로그에 남기기보다, 길이 제한/요약하여 저장 권장.
- 전송 성공 시:
  - 필요 시 Debug 레벨로만 전송 성공 로그 남김.

### 응답 정책
- 클라이언트에는 Discord 전송 성공 여부에 따라:
  - **성공**: `201 Created` 또는 `200 OK` + 간단한 성공 메시지.
  - **실패**: `500` 또는 적절한 HTTP 상태 코드 + “잠시 후 다시 시도해주세요” 수준의 일반화된 메시지.
  - 내부적으로 어떤 Webhook URL/채널이었는지는 노출하지 않는다.

---

## ⚙️ 환경 변수 및 설정

### .env 키 설계
- `DISCORD_BUG_REPORT_WEBHOOK_URL`
  - 예: `https://discord.com/api/webhooks/xxxx/yyyy`
  - 운영/스테이징 환경별로 다른 URL 사용.

### env.validation 연동
- `src/common/config/env.validation.ts`에 다음 항목 추가:
  - `DISCORD_BUG_REPORT_WEBHOOK_URL`: `string().url().required()` 형태로 검증.
  - 테스트/로컬 환경에서 미설정 시에는 앱이 부팅되지 않도록 강제(실제 필요 여부에 따라 선택).

### 모듈 설정
- `ExternalModule` 또는 별도 `DiscordModule`에 Discord Webhook Client를 프로바이더로 등록.
- `FeedbackModule`에서 해당 클라이언트를 주입 받아 사용.

---

## ✅ 테스트 및 검증 계획

### 유닛 테스트
- `BugReportService` 유닛 테스트:
  - 정상 입력 시 BugReport 엔티티/이미지 엔티티가 올바르게 생성/저장되는지 검증 (리포지토리 mock 사용).
  - description/제목이 비어 있거나 너무 짧을 때 `BadRequestException` 발생 여부 검증.
  - 관리자 목록 조회 시 Pagination, 상태/날짜 필터가 올바르게 동작하는지 검증.
  - 미확인 개수가 10개 이상일 때 Discord 알림 로직이 호출되는지 검증.

- `DiscordWebhookClient` 유닛 테스트:
  - 환경변수 미설정 시 예외 발생 여부.
  - 2xx/4xx/5xx 응답에 따른 예외 처리/로깅 동작 검증.

### 통합 테스트 (e2e)
- `POST /feedback/bugs`에 대해:
  - 정상 요청 → 201/200 응답, DB에 BugReport + BugReportImage 레코드가 생성되는지 확인.
  - 잘못된 요청(body 누락 등) → 400 응답.

- 관리자 목록/상세 API에 대해:
  - 인증/권한이 없는 경우 403/401 응답.
  - 기본 요청 시 `미확인` 상태만, Pagination이 적용된 결과가 내려오는지 검증.

### 수동 검증
- 실제 S3 버킷/Discord Webhook URL을 설정 후:
  - 로컬에서 버그 신고 API 호출 → S3에 이미지가 업로드되고, DB에 URL이 저장되는지 확인.
  - 미확인 버그 제보를 10개 이상 만들어, Discord 채널에 알림이 전송되는지 확인.

---

## 🛠 구현 단계 계획

### Phase 1: 도메인/DB 설계
- `BugReport` 엔티티 설계
  - 필드 예시:
    - `id`, `userId`
    - `category`, `title`, `description`
    - `status`(미확인/확인)
    - `images` (`jsonb` 배열, 최대 5장)
      - 예: `{ url: string; originalName?: string }[]`
    - `createdAt`, `updatedAt`
- 마이그레이션 스크립트 작성 및 적용.

### Phase 2: 모듈/레이어 구성
- `FeedbackModule` 또는 `BugReportModule` 생성:
  - `BugReportController`, `BugReportService`, 엔티티 리포지토리 등록.
- 관리자 전용 API는 `/admin/bug-reports` 네임스페이스로 분리하고, Role Guard(`ADMIN`) 적용.

### Phase 3: 버그 제보 생성 API
- `POST /feedback/bugs` 구현:
  - DTO(`CreateBugReportDto`)에 카테고리/제목/상세내용/이미지 필드 정의 및 validation 추가.
  - `multipart/form-data` 업로드 처리(이미지 배열 수신, **최대 5장** 제한).
  - S3 업로드 클라이언트(`AwsS3Client` 등)를 통해 이미지 업로드 → URL 배열 확보.
  - URL 배열을 `BugReport.images`(`jsonb`) 필드에 저장.

### Phase 4: 관리자 목록/상세 API + Pagination/필터
- `GET /admin/bug-reports`:
  - 쿼리 파라미터: `page`, `limit`, `status`, `date`(또는 `from/to`), `mode=all|unconfirmed|confirmed` 등.
  - 기본값: `status=미확인`, 최신 생성 순 정렬.
  - Pagination 응답 형태 정의(`items`, `pageInfo`).
- `GET /admin/bug-reports/:id`:
  - BugReport + 이미지 목록 + 유저 기본 정보 반환.

### Phase 5: 상태 변경 API
- `PATCH /admin/bug-reports/:id/status`:
  - Body에 목표 상태(`확인`)를 전달.
  - 현재 상태 검증 후 업데이트, `updatedAt` 갱신.
  - 유저는 이 API를 호출할 수 없고, 관리자만 호출 가능하도록 Guard 적용.

### Phase 6: Discord Webhook 알림 로직 (스케줄러 기반)
- `DiscordWebhookClient` 구현:
  - `.env`의 `DISCORD_BUG_REPORT_WEBHOOK_URL`를 사용해 Webhook POST.
  - 실패 시 로깅 + `ExternalApiException` throw.
- **스케줄러 기반 미확인 개수 체크**:
  - NestJS `@nestjs/schedule`의 `@Cron` 또는 `@Interval`을 사용해 **주기적(예: 5분마다)**으로 미확인 버그 제보 개수를 조회.
  - 조회 시:
    - 미확인 개수가 **10개 이상**인지 확인.
  - 알림 전송 조건:
    - 미확인 개수가 **10개 이상**이면 Discord 알림 전송.
  - 버그 제보 생성 로직(`createBugReport`)에서는 **미확인 개수 count 쿼리를 수행하지 않고**,  
    오직 스케줄러에서만 count + 알림 로직을 수행하도록 분리.
  - **참고**: 중복 알림 방지 기능은 Redis 도입 후 Phase 7 이후에 추가 예정.

### Phase 7: 운영/보안 정리
- 관리자 전용 라우트에 Role Guard 및 필요한 추가 보안(IP 제한 등) 적용.
- 이미지 URL 접근 제어 방식(프리사인드 URL, 공개 버킷+난수 키 등) 결정.
- 모니터링/로그(실패한 Webhook, S3 업로드 실패 등)를 Prometheus/Grafana 대시보드와 연계할 여지 검토.


