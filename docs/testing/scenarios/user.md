# 사용자 (User) 테스트 시나리오

## Backend API 테스트

### 프로필 수정 (PATCH /user)
- [x] 정상 수정 (name, birthDate, gender) → 200
- [x] name 100자 초과 → 400
- [x] birthDate 잘못된 형식 (YYYY-MM-DD 아닌 값) → 400
- [x] gender 잘못된 값 → 400
- [x] 인증 없이 요청 → 401

### 회원 탈퇴 (DELETE /user/me)
- [x] 정상 탈퇴 → 200 + soft delete
- [x] 탈퇴 후 로그인 시도 → 401
- [x] 탈퇴 후 기존 토큰 사용 → 401
- [x] 인증 없이 요청 → 401

### 선호도 관리 (GET /user/preferences, POST /user/preferences)
- [x] GET — 선호도 조회 → 200 + likes/dislikes 배열
- [x] GET — 인증 없이 요청 → 401
- [x] POST — 선호도 업데이트 (likes, dislikes) → 200
- [x] POST — likes 50개 초과 → 400
- [x] POST — 각 항목 50자 초과 → 400
- [x] POST — 인증 없이 요청 → 401

### 언어 설정 (PATCH /user/language)
- [x] 정상 변경 (ko → en) → 200
- [x] 잘못된 언어 값 (fr 등) → 400
- [x] 인증 없이 요청 → 401
