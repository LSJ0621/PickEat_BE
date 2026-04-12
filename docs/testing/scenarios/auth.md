# 인증 (Auth) 테스트 시나리오

## Backend API 테스트

### 회원가입 (POST /auth/register)
- [x] 정상 회원가입 (email, password, name, birthDate, gender) → 201
- [x] email 누락 → 400 + 필드명 포함 에러
- [x] password 8자 미만 → 400
- [x] 이미 존재하는 email → 400 (AUTH_EMAIL_ALREADY_EXISTS)
- [x] 인증 안 된 이메일로 가입 시도 → 400 (AUTH_EMAIL_NOT_VERIFIED)
- [x] 응답에 password 미포함 확인

### 로그인 (POST /auth/login)
- [x] 정상 로그인 → 201 + accessToken + refreshToken
- [x] 잘못된 비밀번호 → 401
- [x] 존재하지 않는 이메일 → 401
- [x] 탈퇴한 사용자 로그인 → 401
- [x] 비활성화된 사용자 로그인 → 401
- [x] 응답에 password 미포함 확인

### 이메일 중복 확인 (GET /auth/check-email)
- [x] 사용 가능한 이메일 → 200 + available: true
- [x] 이미 존재하는 이메일 → 200 + available: false
- [x] 이메일 형식 아닌 값 → 400

### 이메일 인증 (POST /auth/email/send-code, POST /auth/email/verify-code)
- [x] 인증 코드 발송 (purpose: SIGNUP) → 201
- [x] 인증 코드 발송 (purpose: RE_REGISTER) → 201
- [x] 올바른 코드 검증 → 201 + verified 상태
- [x] 잘못된 코드 검증 → 400
- [x] purpose=RE_REGISTER로 검증 시 soft-delete된 사용자 없으면 → 400

### 토큰 관리 (POST /auth/refresh, POST /auth/logout, GET /auth/me)
- [x] 만료된 accessToken을 Bearer로 전송 → Redis에서 refreshToken 검증 → 새 accessToken 반환 + Redis refreshToken 갱신 (Token Rotation)
- [x] Authorization 헤더 없이 refresh 요청 → 401 (AUTH_MISSING_ACCESS_TOKEN)
- [x] 서명이 잘못된 accessToken으로 refresh → 401 (AUTH_INVALID_REFRESH_TOKEN)
- [x] Redis에 refreshToken 없음 (로그아웃 상태) → 401 (AUTH_INVALID_REFRESH_TOKEN)
- [x] Redis의 refreshToken이 만료됨 → 401 + Redis에서 삭제
- [x] 탈퇴한 사용자(deletedAt)의 refresh → 401 + Redis에서 삭제
- [x] 비활성화된 사용자(isDeactivated)의 refresh → 403 (AUTH_ACCOUNT_DEACTIVATED) + Redis에서 삭제
- [x] 로그아웃 → 200 + refreshToken 무효화
- [x] 인증 없이 로그아웃 시도 → 401
- [x] GET /auth/me → 현재 사용자 프로필 (password 미포함)
- [x] 인증 없이 GET /auth/me → 401

### 비밀번호 재설정 (POST /auth/password/reset/send-code, verify-code, reset)
- [x] 재설정 코드 발송 → 201
- [x] 코드 검증 → 201
- [x] 새 비밀번호 설정 후 로그인 성공 → 201
- [x] 존재하지 않는 이메일로 재설정 시도 → 400 (AUTH_EMAIL_NOT_REGISTERED)

### OAuth (POST /auth/kakao/doLogin, POST /auth/google/doLogin, POST /auth/kakao/appLogin)
- [x] Kakao OAuth 웹 로그인 (code 기반) → 201 + 토큰 반환
- [x] Kakao 앱 로그인 (accessToken 직접 전달) → 201 + 토큰 반환
- [x] Google OAuth 정상 로그인 → 201 + 토큰 반환
- [x] 신규 소셜 사용자 → 자동 회원가입 + 토큰 반환
- [x] 탈퇴한 소셜 사용자 → RE_REGISTER_REQUIRED 에러

### 재가입 (POST /auth/re-register, POST /auth/re-register/social)
- [x] 이메일 재가입 (탈퇴 후) → 201 + 성공
- [x] 소셜 재가입 (탈퇴 후) → 201 + 성공

---

## Backend Unit 테스트

### AuthService
- [x] validateUser — 정상 이메일/비밀번호 → { user, reason: 'success' }
- [x] validateUser — 존재하지 않는 이메일 → { reason: 'not_found' }
- [x] validateUser — 비밀번호 불일치 → { reason: 'wrong_password' }
- [x] validateUser — 삭제된 사용자 → { reason: 'deleted' }
- [x] validateUser — 비활성화된 사용자 → { reason: 'deactivated' }
- [x] validateUser — 소셜 전용 계정 (password 없음) → { reason: 'no_password' }
- [x] buildAuthResult — 토큰 생성 + 프로필 구성 확인
- [x] getUserProfile — 캐시 HIT 시 DB 미조회 확인
- [x] getUserProfile — 캐시 MISS 시 DB 조회 + 캐시 저장

### AuthSocialService
- [x] processKakaoProfile — 신규 사용자 → 자동 생성
- [x] processKakaoProfile — 기존 사용자 → 로그인 처리
- [x] processKakaoProfile — 삭제된 사용자 → RE_REGISTER_REQUIRED 에러
- [x] processGoogleProfile — 신규 사용자 → 자동 생성
- [x] processGoogleProfile — 기존 사용자 → 로그인 처리
- [x] reRegisterSocial — 삭제된 사용자 복구 (deletedAt = null)
- [x] reRegisterSocial — 삭제된 소셜 사용자 없으면 → BadRequestException

### EmailVerificationService

#### sendCode — 정상 발송
- [x] SIGNUP purpose + 기존 코드 없음 → 신규 코드 저장 + 이메일 발송
- [x] 기존 코드가 만료된 상태 → 신규 코드로 갱신 + 이메일 발송
- [ ] PASSWORD_RESET purpose + 가입된 이메일 → 정상 발송

#### sendCode — 에러/제한
- [x] 재발송 쿨다운(설정값) 이내 재요청 → BadRequestException (AUTH_EMAIL_RESEND_COOLDOWN)
- [ ] 이미 인증 완료된 코드가 유효 기간 내 존재 → 중복 발송 방지 분기
- [ ] PASSWORD_RESET purpose + 존재하지 않는 이메일 → BadRequestException (AUTH_EMAIL_NOT_REGISTERED)

#### verifyCode — 분기
- [x] 올바른 코드 → verified=true + 상태 업데이트
- [x] 잘못된 코드 → BadRequestException (AUTH_EMAIL_VERIFICATION_CODE_MISMATCH)
- [x] 만료된 코드 → BadRequestException (AUTH_EMAIL_VERIFICATION_CODE_EXPIRED)
- [x] 존재하지 않는 코드 레코드 → BadRequestException

### AuthService — 추가 분기
- [ ] refreshTokens — accessToken 서명 유효 + Redis refreshToken 만료 → UnauthorizedException + Redis에서 삭제
- [ ] refreshTokens — 탈퇴한 사용자(deletedAt) → UnauthorizedException + Redis 정리
- [ ] refreshTokens — 토큰 rotation 직후 이전 refreshToken 재사용 시도 → UnauthorizedException
- [ ] logout — Redis에 refreshToken 없음 → 멱등 처리 (예외 없음) <!-- 행동 테스트 원칙 §6.1 위반(mock 호출 횟수만 검증)으로 제거 -->

- [ ] login — 소셜 전용 계정(password 없음)에 이메일+패스워드 로그인 시도 → UnauthorizedException

### AuthSocialService — 추가 분기
- [x] processKakaoProfile — 프로필에 email 없음 → 필수 필드 누락 예외
- [ ] processGoogleProfile — 이름이 공백만 포함 → fallback 이름으로 사용자 생성
- [x] processKakaoProfile — 비활성화(isDeactivated) 사용자 → 적절한 예외
- [ ] 프로필 preferredLanguage가 en/ko 아닌 값 → 기본 언어로 매핑
- [ ] reRegisterSocial — 탈퇴한 지 오래된 사용자 → deletedAt null로 복구 정상 처리
