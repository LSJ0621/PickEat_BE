# 버그 리포트 (Bug Report) 테스트 시나리오

## Backend API 테스트

### 버그 제보 (POST /bug-reports)
- [x] 정상 제보 (category, title, description + 이미지) → 201
- [x] title 30자 초과 → 400
- [x] description 500자 초과 → 400
- [x] 이미지 5개 초과 → 400
- [x] 인증 없이 요청 → 401
- [x] Discord mock의 send가 1회 호출되었는지 확인
- [x] Discord 알림 실패해도 버그 리포트는 저장 성공 (fire-and-forget)

### 관리자 버그 관리 (GET /admin/bug-reports, PATCH /admin/bug-reports/:id/status)
> **테스트 파일**: `admin.api.spec.ts` (admin-bug-report.controller.ts는 /admin 경로 하위이므로 관리자 API 테스트에 통합)
- [x] 관리자 목록 조회 (페이지네이션 + 필터) → 200
- [x] 관리자 상세 조회 (이력 포함) → 200
- [x] 상태 변경 → 200
- [x] 일반 사용자 접근 → 403
