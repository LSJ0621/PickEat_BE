# Pick Eat 프론트에서 이메일 인증 API 사용 가이드

## 기본 흐름
- 가입/비밀번호 재설정 화면에서 `email` 입력 → `POST /auth/email/send-code` 호출로 코드 발송
- 사용자가 받은 6자리 코드를 입력 → `POST /auth/email/verify-code` 호출로 검증
- 가입 목적(`SIGNUP`)은 기본값, 비밀번호 재설정은 `purpose: "RESET_PASSWORD"`를 함께 보냄
- 두 API 모두 성공 시 `{ "success": true }` 반환, 에러 메시지는 `response.data.message`에 포함

## 코드 발송 요청
```ts
await axios.post('/auth/email/send-code', {
  email: form.email,
  purpose: mode === 'reset' ? 'RESET_PASSWORD' : 'SIGNUP',
});
```
- 전송 직후 60초 동안 재요청 금지, 하루 최대 5회 → UI에서 60초 타이머와 남은 횟수 안내 노출
- 실패 메시지 예: `인증코드를 너무 자주 요청하고 있습니다. 잠시 후 다시 시도해주세요.`

## 코드 검증 요청
```ts
await axios.post('/auth/email/verify-code', {
  email: form.email,
  code: form.code, // 문자열 그대로 전달 (예: "042391")
  purpose: mode === 'reset' ? 'RESET_PASSWORD' : 'SIGNUP',
});
```
- 만료 시간: 3분. 만료 시 `코드가 만료되었습니다` 반환
- 실패 5회 시 당일 차단 → 메시지 `5회 실패로 인해 다음날까지 회원가입이 불가능합니다`
- 가입(`SIGNUP`) 성공 시 백엔드가 `emailVerified`를 true로 마킹하므로 이후 가입/로그인 절차 진행

## UI/상태 관리 팁
- 발송 성공 시 3분 타이머와 6자리 입력 필드 활성화
- 서버 에러 메시지를 토스트/배너로 그대로 노출해 사용자가 재시도 기준을 알 수 있게 함
- 검증 성공 후 다음 단계(회원가입 제출/비밀번호 변경)에서 `email`과 `purpose`를 동일하게 유지

## 메일이 오지 않을 때 재전송 UX
- “메일을 못 받으셨나요?” 문구와 함께 재전송 버튼을 제공하되, 서버에서 막는 60초 쿨다운과 일 5회 제한을 UI에서도 표시
- 재전송 클릭 시 동일한 `email`/`purpose`로 `POST /auth/email/send-code` 재호출
- 60초 제한 메시지(`인증코드를 너무 자주 요청하고 있습니다. 잠시 후 다시 시도해주세요.`) 수신 시 버튼 비활성화 및 타이머 노출
- 5회 초과 메시지(`하루 최대 발송 횟수를 초과했습니다`) 수신 시 당일 재전송 버튼 비활성화하고 다음날 다시 시도 안내
