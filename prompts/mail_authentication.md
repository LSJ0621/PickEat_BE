# Pick Eat 이메일 인증 코드 기능 구현 요청

너는 NestJS + TypeORM + Nodemailer를 잘 아는 시니어 백엔드 개발자이다.  
아래 요구사항에 맞게 내 NestJS 서버에 **이메일 인증 코드 발송/검증 기능**을 구현해줘.

---

## 1. 현재 프로젝트 환경

- NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/typeorm`)
- TypeORM 사용 (PostgreSQL)
- `.env` 환경변수 사용 (process.env로 직접 접근)
- 기존 `User` 엔티티 위치: `src/user/entities/user.entity.ts`
- 기존 `AuthModule` 위치: `src/auth/auth.module.ts`
- 기존 `AuthController` 위치: `src/auth/auth.controller.ts`
- 기존 `AuthService` 위치: `src/auth/auth.service.ts`
- DTO 위치: `src/auth/dto/`
- **중요**: `User` 엔티티에 `emailVerified` 필드가 없으므로 추가 필요  
  - `@Column({ default: false }) emailVerified: boolean;`

메일 발송은 **네이버 SMTP**를 사용하며, `.env`에는 다음 환경변수가 설정되어 있다.

```env
EMAIL_HOST=smtp.naver.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_ADDRESS=네이버메일주소@naver.com
EMAIL_PASSWORD=네이버_애플리케이션_비밀번호
```

서비스명: **Pick Eat**

---

## 2. 구현 목표

### 2-1. 이메일 인증 코드 발송 API
- **Endpoint:** `POST /auth/email/send-code`
- **Body**
```json
{
  "email": "string",
  "purpose": "SIGNUP" | "RESET_PASSWORD" (optional)
}
```

#### 요구사항
- 6자리 숫자 인증코드 생성 (예: `"482913"`)
  - `crypto.randomInt` 기반 CSPRNG 사용
  - `toString().padStart(6, '0')`로 항상 6자리 유지
- 인증코드는 DB에 **해시(bcrypt)** 로만 저장 (평문 금지)
- 동일 이메일+purpose 조합에 대해 재발송 제한
  - **60초 이내 재발송 금지**
  - **하루 최대 발송 3회** (재발급 3회까지만 가능)
- 인증코드 유효 시간: **3분**
- 메일 내용
  - 제목: `[Pick Eat] 이메일 인증 코드`
  - 본문:  
    ```
    인증코드: 482913

    해당 코드는 3분 동안만 유효합니다.
    ```

### 2-2. 이메일 인증 코드 검증 API
- **Endpoint:** `POST /auth/email/verify-code`
- **Body**
```json
{
  "email": "string",
  "code": "string",
  "purpose": "SIGNUP" | "RESET_PASSWORD" (optional)
}
```

#### 동작 요구사항
- 해당 이메일+purpose 조합의 **가장 최근 레코드**로 검증
- 검증 로직
  - 레코드 없음 → `"코드가 유효하지 않습니다"`
  - `expiresAt` 지남 → `"코드가 만료되었습니다"`
  - `used === true` → `"이미 사용된 코드입니다"`
  - bcrypt 비교 실패 시 → `"코드가 유효하지 않습니다"`
    - **실패 시 failCount 증가**
    - 같은 날짜 기준 failCount 누적
    - **5회 실패 시** → `"5회 실패로 인해 다음날까지 회원가입이 불가능합니다"`
- 성공 시
  - 해당 레코드 `used = true`, `usedAt = now`
  - `purpose === 'SIGNUP'`이면 `User.emailVerified = true`로 업데이트
- 응답: `{ "success": true }`

---

## 3. 보안 / 안전성 요구사항

### 인증코드 생성
- `crypto.randomInt(0, 10 ** 6)` → 0~999999 정수
- `padStart(6, '0')`

### 인증코드 저장
- DB에는 해시(`bcrypt`, saltRounds=10)만 저장

### 재발송 제한
- `lastSentAt` 기준 30초 이내 재발송 금지
- 하루 최대 `sendCount = 3`
  - 날짜 비교는 `createdAt` 또는 `lastSentAt`를 `toDateString()`으로 비교

### 검증 실패 제한
- `failCount` 필드로 실패 횟수 누적
- 같은 날짜 기준 `failCount >= 5`면 다음날까지 차단
  - 자정이 지나면 다시 시도 가능

### 에러 메시지
- 내부 구조 노출 금지
- 사용자 친화적인 메시지로 응답

### 환경변수
- `EMAIL_ADDRESS`, `EMAIL_PASSWORD` 등은 절대 하드코딩 금지
- `process.env`로만 접근

---

## 4. DB / 엔티티 설계

### 4-1. User 엔티티 수정
- 파일: `src/user/entities/user.entity.ts`
- 필드 추가:
```typescript
@Column({ default: false })
emailVerified: boolean;
```

### 4-2. EmailVerification 엔티티 생성
- 파일 위치: `src/auth/entities/email-verification.entity.ts`
```typescript
// src/auth/entities/email-verification.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('email_verifications')
export class EmailVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  email: string;

  @Column()
  codeHash: string;

  @Column({ nullable: true })
  purpose?: string; // 'SIGNUP' | 'RESET_PASSWORD'

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  sendCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSentAt?: Date;

  @Column({ type: 'int', default: 0 })
  failCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

## 5. 모듈 / 서비스 / 컨트롤러 구조

### 5-1. 모듈 구성
- **AuthModule에 통합** (별도 모듈 생성 없음)
  - `src/auth/auth.module.ts`에서 `TypeOrmModule.forFeature`에 `EmailVerification` 추가
  - `EmailVerificationService`를 providers에 등록
  - 필요 시 `MailerModule`도 여기서 설정
- 새로 생성할 파일
  - `src/auth/entities/email-verification.entity.ts`
  - `src/auth/services/email-verification.service.ts`
  - `src/auth/dto/send-email-code.dto.ts`
  - `src/auth/dto/verify-email-code.dto.ts`
- 수정할 파일
  - `src/auth/auth.controller.ts` (엔드포인트 추가)
  - `src/auth/auth.module.ts` (모듈 설정)
  - `src/user/entities/user.entity.ts` (emailVerified)
  - `src/user/user.service.ts` (emailVerified 업데이트 메서드)

### 5-2. EmailVerificationService
- 파일: `src/auth/services/email-verification.service.ts`
- 메서드 요구사항:

#### `generateCode(length = 6): string`
- 위에서 정의한 방식으로 6자리 코드 생성

#### `sendCode(email: string, purpose: EmailPurpose): Promise<void>`
- 메일 환경변수 확인 (`ensureMailConfig`)
- `normalizePurpose` (기본값 SIGNUP)
- 최신 레코드 조회 → `getLatest(email, purpose)`
- **차단 체크 (`ensureNotBlocked`)**
- 재발송 제한
  - `isSameDay(now, baseDate)`
  - 60초 이내 재발송 금지
  - 하루 3회 초과 시 에러
- 코드 생성 및 해시
  - same day면 기존 레코드 업데이트 (`updateExistingRecord`)
  - 아니면 새 레코드 생성 (`createNewRecord`)
- Nodemailer로 메일 발송

#### `verifyCode(email: string, code: string, purpose: EmailPurpose): Promise<boolean>`
- `ensureNotBlocked` (5회 실패 차단)
- 레코드 없으면 에러
- used / expiresAt 검사
- bcrypt 비교
  - 실패: failCount 증가 (같은 날이면 +1, 아니면 1로 초기화)
  - 5회 도달 시 차단 메시지
- 성공: used=true, usedAt=now 저장
- 호출자가 `User.emailVerified = true`로 업데이트할 수 있도록 true 반환

### 5-3. DTO 정의
- `src/auth/dto/send-email-code.dto.ts`
```typescript
import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export enum EmailPurpose {
  SIGNUP = 'SIGNUP',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

export class SendEmailCodeDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;
}
```

- `src/auth/dto/verify-email-code.dto.ts`
```typescript
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EmailPurpose } from './send-email-code.dto';

export class VerifyEmailCodeDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;
}
```

### 5-4. AuthController 수정
- `POST /auth/email/send-code`
  - DTO: `SendEmailCodeDto`
  - `emailVerificationService.sendCode(...)`
  - 응답: `{ "success": true }`
- `POST /auth/email/verify-code`
  - DTO: `VerifyEmailCodeDto`
  - `emailVerificationService.verifyCode(...)`
  - purpose가 SIGNUP이면 `UserService`의 `markEmailVerified(email: string)` 호출
  - 응답: `{ "success": true }`

---

## 6. 메일 발송 (Nodemailer + 네이버 SMTP)
- `EmailVerificationService` 내부에서 Nodemailer 설정

```typescript
import * as nodemailer from 'nodemailer';

private readonly transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

- `sendCode`에서 사용

```typescript
await this.transporter.sendMail({
  from: `"Pick Eat" <${process.env.EMAIL_ADDRESS}>`,
  to: email,
  subject: '[Pick Eat] 이메일 인증 코드',
  text: `인증코드: ${code}\n\n해당 코드는 3분 동안만 유효합니다.`,
});
```

---

## 7. 출력 형식 / 코드 품질

- 설명보다는 **실제 적용 가능한 NestJS 코드**를 작성
- 새 파일은 다음과 같이 주석
  ```
  // NEW FILE: src/auth/services/email-verification.service.ts
  ```
- 기존 파일 수정 시
  ```
  // UPDATE FILE: src/auth/auth.module.ts
  ```
- NestJS 코딩 컨벤션 준수
  - `private readonly logger = new Logger(...)`
  - `BadRequestException` 등 예외 사용
  - `class-validator` 데코레이터 사용
- 불필요한 `console.log` 사용 금지 (필요 시 Nest Logger)

---

## 8. 리소스 위치 요약

**새로 생성**
- `src/auth/entities/email-verification.entity.ts`
- `src/auth/services/email-verification.service.ts`
- `src/auth/dto/send-email-code.dto.ts`
- `src/auth/dto/verify-email-code.dto.ts`

**수정**
- `src/user/entities/user.entity.ts` (emailVerified)
- `src/auth/auth.module.ts` (모듈 설정)
- `src/auth/auth.controller.ts` (엔드포인트)
- `src/user/user.service.ts` (`markEmailVerified`)

---

위 요구사항을 모두 충족하는 NestJS 코드를 작성해줘.  
코드는 바로 프로젝트에 붙여넣고 사용할 수 있을 정도의 완성도를 갖춰야 하며, 테스트/운영 환경에서 안전하게 동작해야 한다.

