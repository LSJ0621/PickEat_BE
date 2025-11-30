# 회원 탈퇴 구현 가이드 (Soft Delete)

## 1. 개요

회원 탈퇴는 **Soft Delete** 방식으로 구현합니다. 실제 데이터를 삭제하지 않고 `deletedAt` 필드를 통해 탈퇴 상태를 관리합니다.

## 2. 엔티티 수정

### 2.1 User 엔티티
- `@DeleteDateColumn` 데코레이터를 사용하여 `deletedAt` 필드 추가
- 재가입 전용 이메일 인증 필드 추가: `reRegisterEmailVerified` (boolean, default: false)
- TypeORM이 자동으로 soft delete를 처리하며, 기본 조회 시 `deletedAt`이 `null`인 레코드만 조회됨
- `emailVerified`는 그대로 유지 (탈퇴 시 리셋하지 않음)

### 2.2 SocialLogin 엔티티
- 동일하게 `@DeleteDateColumn` 데코레이터로 `deletedAt` 필드 추가

## 3. 회원 탈퇴 구현

### 3.1 탈퇴 처리 방식
- `EntityManager.transaction()`을 사용하여 트랜잭션 처리
- User와 SocialLogin 중 하나만 존재하더라도 트랜잭션으로 일관성 유지
- 에러 발생 시 자동 롤백

### 3.2 탈퇴 시 처리 사항
1. **refreshToken 제거**: 기존 토큰을 `null`로 설정하여 무효화
2. **reRegisterEmailVerified 리셋**: 재가입 전용 인증 필드를 항상 `false`로 설정 (재가입 시 이메일 인증 필수)
   - 재가입 후 다시 탈퇴할 수 있으므로, 탈퇴 시마다 반드시 `false`로 리셋
3. **soft delete 실행**: `deletedAt`에 현재 시간 설정
4. **emailVerified 유지**: 기존 `emailVerified` 값은 그대로 유지 (리셋하지 않음)

### 3.3 재가입 전용 인증 필드 관리
- `emailVerified`: 일반 회원가입 시 사용하는 인증 필드 (탈퇴 시 유지)
- `reRegisterEmailVerified`: 재가입 시 사용하는 전용 인증 필드
  - **탈퇴 시 항상 `false`로 리셋**: 재가입 후 다시 탈퇴할 수 있으므로, 탈퇴할 때마다 반드시 `false`로 설정
  - **재가입 시**: `EmailVerification` 테이블의 `RE_REGISTER` 목적 인증 상태를 확인하고, 완료되면 `true`로 설정

## 4. 재가입 절차 구현

### 4.1 재가입 플로우 설계
재가입을 별도 플로우로 분리하여 일반 회원가입과 구분합니다.

**일반 회원 재가입 플로우**:
1. 이메일 중복 확인 → soft delete된 사용자 발견 시 "재가입하시겠습니까?" 메시지 반환
2. 재가입 화면으로 이동
3. 이메일 인증 (목적: `RE_REGISTER`)
4. 비밀번호 입력
5. 재가입 API 호출 → 전체 값 UPDATE

### 4.2 EmailPurpose에 RE_REGISTER 추가
- `EmailPurpose` enum에 `RE_REGISTER` 추가하여 재가입 목적의 이메일 인증 구분

### 4.3 이메일 중복 확인 수정
- `checkEmail` 메서드 수정:
  - **User와 SocialLogin 두 테이블 모두 확인**: 같은 email이 어느 테이블에든 존재하는지 확인
  - soft delete된 사용자도 포함하여 조회 (`withDeleted: true`)
  - **응답 형식**:
    - 사용 가능한 경우: `{ available: true, message: '사용 가능한 이메일입니다.' }`
    - 활성 사용자가 존재하는 경우: `{ available: false, message: '이미 사용 중인 이메일입니다.' }`
    - 탈퇴한 사용자인 경우: `{ available: false, canReRegister: true, message: '기존에 탈퇴 이력이 있습니다. 재가입하시겠습니까?' }`
  - **중요**: 한 이메일은 하나의 계정 타입만 사용 가능 (소셜 로그인으로 가입한 이메일로 일반 회원가입 불가, 반대도 불가)
- `register` 메서드도 User와 SocialLogin 두 테이블 모두 확인
  - 어느 테이블에든 활성 사용자가 존재하면 `BadRequestException` 에러 발생
  - 에러 응답: HTTP 400 상태 코드와 함께 `{ statusCode: 400, message: '이미 등록된 이메일입니다.' }` 반환
  - soft delete된 사용자만 존재하면 재가입 플로우로 진행

### 4.4 재가입 전용 API
- `POST /auth/re-register` 엔드포인트 추가
- 재가입 DTO 생성 (email, password, name)
- 재가입 서비스 메서드 구현
- **중요**: 재가입 시 User 테이블의 soft delete된 사용자만 확인 (일반 회원 재가입이므로)

### 4.5 재가입 처리 로직
1. soft delete된 사용자 조회 (`withDeleted: true`)
2. 이메일 인증 완료 여부 확인 (목적: `RE_REGISTER`)
3. 비밀번호 해싱
4. `update()` 메서드를 사용하여 전체 값 UPDATE:
   - 새로운 비밀번호
   - 새로운 이름
   - `reRegisterEmailVerified: true` (재가입 전용 인증 필드)
   - `refreshToken: null`
   - `deletedAt: null` (soft delete 해제)
   - `emailVerified`는 기존 값 유지 (변경하지 않음)
5. 이메일 인증 코드 만료 처리

### 4.6 소셜 로그인 재가입 처리

**소셜 로그인 재가입 플로우**:
1. 소셜 로그인 시도 → User 테이블 확인하여 활성 사용자가 존재하면 에러 발생
2. SocialLogin 테이블에서 soft delete된 사용자 발견
3. `RE_REGISTER_REQUIRED` 에러 반환하여 "탈퇴한 이력이 있습니다. 재가입하시겠습니까?" 메시지 전달
4. 재가입 화면으로 이동
5. 재가입 API 호출 (`POST /auth/re-register/social`)
6. 소셜 로그인은 소셜 플랫폼에서 이미 인증됨 (이메일 인증 불필요)
7. `deletedAt`을 `null`로 설정하여 활성화

**소셜 로그인 재가입 처리**:
- 소셜 로그인 시도 시 User 테이블도 확인하여 활성 사용자가 존재하면 "이미 일반 회원가입으로 가입한 이메일입니다" 에러 발생
- `getUserBySocialId` 메서드에서 `withDeleted: true` 옵션 사용
- 탈퇴한 소셜 로그인 사용자 발견 시 재가입 플로우로 유도
- 재가입 API에서 `update()` 메서드로 `deletedAt` 해제 및 `refreshToken` 제거

### 4.7 재가입 정책

1. **일반 회원 → 일반 회원 재가입**: 
   - 이메일 중복 확인 시 재가입 안내
   - 재가입 화면으로 이동
   - 이메일 인증 필수 (목적: `RE_REGISTER`)
   - 비밀번호 입력
   - 전체 값 UPDATE로 재가입 처리

2. **일반 회원 → 소셜 로그인**: 
   - 소셜 로그인 시도 시 User 테이블에 활성 사용자가 존재하면 에러 발생
   - "이미 일반 회원가입으로 가입한 이메일입니다" 메시지 반환
   - 소셜 로그인은 소셜 플랫폼에서 이미 인증됨 (이메일 인증 불필요)
   - **중요**: 한 이메일은 하나의 계정 타입만 사용 가능하므로, 일반 회원가입으로 가입한 이메일로는 소셜 로그인 불가

3. **소셜 로그인 → 소셜 로그인 재가입**: 
   - 소셜 로그인 시도 시 탈퇴한 사용자 발견
   - 재가입 안내 메시지 반환
   - 재가입 화면으로 이동
   - 소셜 플랫폼에서 이미 인증됨 (이메일 인증 불필요)
   - 재가입 API 호출 → `deletedAt` 해제

4. **소셜 로그인 → 일반 회원**: 
   - 일반 회원가입 시도 시 SocialLogin 테이블에 활성 사용자가 존재하면 에러 발생
   - "이미 소셜 로그인으로 가입한 이메일입니다" 메시지 반환
   - 일반 회원가입 플로우 사용 (이메일 인증 필수)
   - **중요**: 한 이메일은 하나의 계정 타입만 사용 가능하므로, 소셜 로그인으로 가입한 이메일로는 일반 회원가입 불가

## 5. 조회 메서드 수정

### 5.1 기본 조회 메서드
- TypeORM의 `@DeleteDateColumn`을 사용하면 기본적으로 `deletedAt`이 `null`인 레코드만 조회됨
- 탈퇴한 사용자도 포함하여 조회하려면 `withDeleted: true` 옵션 사용

### 5.2 로그인 시 탈퇴 사용자 체크
- 로그인 시 `withDeleted: true`로 조회하여 탈퇴한 사용자인지 확인
- 탈퇴한 사용자인 경우 로그인 거부

### 5.3 소셜 로그인 조회 메서드
- `getUserBySocialId` 메서드에서 `withDeleted: true` 옵션 사용하여 탈퇴한 사용자도 조회 가능하도록 수정

## 6. API 엔드포인트

### 6.1 회원 탈퇴 엔드포인트
- `DELETE /user/me` 엔드포인트 추가
- `JwtAuthGuard`로 보호
- `@CurrentUser()` 데코레이터로 본인 확인

### 6.2 재가입 엔드포인트
- `POST /auth/re-register`: 일반 회원 재가입
- `POST /auth/re-register/social`: 소셜 로그인 재가입

## 7. 보안 고려사항

1. **토큰 무효화**: 탈퇴 시 `refreshToken`을 `null`로 설정하여 기존 토큰 무효화
2. **인증 확인**: 탈퇴 엔드포인트는 반드시 `JwtAuthGuard`로 보호
3. **본인 확인**: 탈퇴는 본인만 가능하도록 `@CurrentUser()` 데코레이터 사용
4. **이메일 인증 필수**: 재가입 시 반드시 새로운 이메일 인증을 받도록 처리 (`reRegisterEmailVerified` 필드로 관리)
5. **인증 필드 분리**: 일반 회원가입 인증(`emailVerified`)과 재가입 인증(`reRegisterEmailVerified`)을 분리하여 관리
6. **이메일 중복 확인**: 한 이메일은 하나의 계정 타입만 사용 가능
   - 일반 회원가입 시: User와 SocialLogin 두 테이블 모두 확인
     - 어느 테이블에든 활성 사용자가 존재하면 "이미 사용 중인 이메일입니다" 반환
     - 소셜 로그인으로 가입한 이메일로는 일반 회원가입 불가
   - 소셜 로그인 시: User와 SocialLogin 두 테이블 모두 확인
     - 어느 테이블에든 활성 사용자가 존재하면 에러 발생
     - 일반 회원가입으로 가입한 이메일로는 소셜 로그인 불가
   - soft delete된 사용자는 재가입 가능 (해당 계정 타입으로만)

## 8. 테스트 고려사항

1. **유닛 테스트**: 트랜잭션 롤백 테스트 포함
2. **E2E 테스트**: 
   - 탈퇴 후 로그인 시도
   - 탈퇴 후 재가입
   - 일반 회원 → 소셜 로그인 전환
   - 소셜 로그인 → 소셜 로그인 재가입
3. **트랜잭션 테스트**: 동시성 테스트 (동일 사용자 동시 탈퇴 시도)

## 9. 프론트엔드 사용 가이드

### 9.1 회원 탈퇴

**API 엔드포인트**: `DELETE /user/me`

**요청**:
- 헤더: `Authorization: Bearer {accessToken}` (JWT 토큰 필요)
- 본문: 없음

**응답**:
- 성공: `{ message: "회원 탈퇴가 완료되었습니다." }`

**활용 방법**:
- 탈퇴 성공 시 로그아웃 처리 후 로그인 화면으로 이동

### 9.2 일반 회원 재가입

**플로우**:
1. 이메일 중복 확인 (`GET /auth/check-email?email={email}`)
2. 응답에서 `canReRegister: true` 확인 시 재가입 화면으로 이동
3. 이메일 인증 코드 발송 (`POST /auth/email/send-code`, `purpose: "RE_REGISTER"`)
4. 이메일 인증 코드 확인 (`POST /auth/email/verify-code`, `purpose: "RE_REGISTER"`)
5. 비밀번호 입력 후 재가입 API 호출 (`POST /auth/re-register`)

**API 엔드포인트**: `POST /auth/re-register`

**요청 본문**:
- `email`: 이메일 주소
- `password`: 새로운 비밀번호
- `name`: 이름

**응답**:
- 성공: `{ message: "재가입이 완료되었습니다. 로그인해주세요." }`

**활용 방법**:
- 재가입 성공 시 성공 메시지 표시 후 로그인 화면으로 이동
- 자동 로그인되지 않으므로 사용자가 직접 로그인해야 함

### 9.3 소셜 로그인 재가입

**플로우**:
1. 소셜 로그인 시도 (`POST /auth/kakao/doLogin` 또는 `POST /auth/google/doLogin`)
2. 서버에서 탈퇴한 유저 확인 → `RE_REGISTER_REQUIRED` 에러 반환
3. 프론트엔드에서 "탈퇴한 이력이 있습니다. 재가입하시겠습니까?" 알림 표시
4. 사용자가 "재가입하겠다" 선택 → 동일한 소셜 로그인 API를 `reRegister: true`와 함께 재호출
5. 재가입 처리 후 자동으로 로그인 완료 (토큰 발급)
6. 사용자가 "거부" 선택 → 탈퇴 상태 유지 (재호출하지 않음)

**API 엔드포인트**: `POST /auth/kakao/doLogin`, `POST /auth/kakao/appLogin`, `POST /auth/google/doLogin`

**요청 본문**:
- `code`: 인가코드 (또는 `accessToken` for appLogin)
- `reRegister`: 재가입 여부 (optional, boolean, 기본값: false)

**응답**:
- 첫 번째 호출 (탈퇴한 사용자 발견): `{ statusCode: 400, error: "RE_REGISTER_REQUIRED", message: "탈퇴한 이력이 있습니다. 재가입하시겠습니까?" }`
- 두 번째 호출 (`reRegister: true`): 정상 로그인 응답 (토큰 포함)

**프론트엔드 구현 방법**:

1. **소셜 로그인 시도**:
   - 인가코드 또는 accessToken을 받아서 API 호출
   - `reRegister` 파라미터는 첫 호출 시 전달하지 않음 (또는 `false`)

2. **응답 처리**:
   - **성공 (200/201)**: `token` 저장 후 메인 화면으로 이동
   - **에러 (400)**: `error` 필드 확인
     - `error === "RE_REGISTER_REQUIRED"`: 재가입 확인 모달 표시
     - 그 외: 일반 에러 처리

3. **재가입 확인 모달**:
   - 메시지: `"탈퇴한 이력이 있습니다. 재가입하시겠습니까?"`
   - 확인 버튼: 동일한 API를 `reRegister: true`와 함께 재호출
   - 취소 버튼: 모달 닫기 (아무 동작 없음)

4. **재가입 처리**:
   - 동일한 인가코드(또는 accessToken)와 `reRegister: true`를 함께 전달
   - 성공 시: 토큰 저장 및 메인 화면으로 이동
   - 실패 시: 에러 메시지 표시

**주의사항**:
- 소셜 로그인은 이메일 인증 불필요 (소셜 플랫폼에서 이미 인증됨)
- 재가입 확인 시 바로 로그인 처리되므로 별도의 로그인 단계가 필요 없음
- 사용자가 거부하면 재호출하지 않음 (탈퇴 상태 유지)

### 9.4 이메일 중복 확인 응답 처리

**API 엔드포인트**: `GET /auth/check-email?email={email}`

**응답 형식**:
- 사용 가능: `{ available: true, message: "사용 가능한 이메일입니다." }`
- 사용 중: `{ available: false, message: "이미 사용 중인 이메일입니다." }`
- 재가입 가능: `{ available: false, canReRegister: true, message: "기존에 탈퇴 이력이 있습니다. 재가입하시겠습니까?" }`

**활용 방법**:
- `available: true` → 회원가입 진행
- `canReRegister: true` → 재가입 화면으로 이동 또는 재가입 안내 모달 표시
- 그 외 → 에러 메시지 표시

### 9.5 주의사항

1. **일반 회원 재가입**: 반드시 이메일 인증(`RE_REGISTER` 목적)을 완료한 후 재가입 API를 호출해야 합니다. 재가입 성공 후 자동 로그인되지 않으므로 사용자가 직접 로그인해야 합니다.
2. **소셜 로그인 재가입**: 이메일 인증이 필요 없습니다. 소셜 플랫폼에서 이미 인증되었기 때문입니다. 재가입 확인 시 바로 로그인 처리되므로 별도의 로그인 단계가 필요 없습니다.
3. **소셜 로그인 재가입 플로우**: 탈퇴한 사용자 발견 시 `RE_REGISTER_REQUIRED` 에러 반환 → 확인 모달 표시 → 동일한 API를 `reRegister: true`와 함께 재호출 → 자동 로그인 완료
4. **응답 형식**: 일반 회원 재가입 API는 토큰을 반환하지 않고 성공 메시지만 반환합니다. 소셜 로그인 재가입은 정상 로그인 응답(토큰 포함)을 반환합니다.
5. **에러 처리**: 모든 API 호출에서 적절한 에러 처리를 구현해야 합니다.
