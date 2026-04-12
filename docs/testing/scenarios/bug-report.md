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

### 이미지 업로드 부분 실패 (POST /bug-reports - partial upload failure)
- [x] 이미지 업로드가 일부 실패해도 성공한 것만 저장되고 201을 반환한다

### 필터 조회 (GET /admin/bug-reports - filters)
- [x] status 필터로 조회하면 해당 상태의 버그 리포트만 반환한다
- [x] category 필터로 조회하면 해당 카테고리의 버그 리포트만 반환한다
- [x] search 필터로 제목/설명에서 검색한다
- [x] date 필터로 특정 날짜의 버그 리포트만 반환한다

### 상태 변경 + 이력 (Status change with history)
- [x] 상태 변경 후 상세 조회하면 statusHistory에 이력이 포함된다

### 관리자 버그 관리 (Admin Bug Report Management)
> **테스트 파일**: `admin.e2e-spec.ts` (admin-bug-report.controller.ts는 /admin 경로 하위이므로 관리자 API 테스트에 통합)
- [x] 관리자가 조회하면 200 + 페이지네이션된 목록을 반환한다
- [x] 관리자가 상세 조회하면 200 + statusHistory 포함 상세 정보를 반환한다
- [x] 관리자가 상태 변경하면 200 + 변경된 상태를 반환한다
- [x] 일반 사용자가 관리자 버그 리포트 엔드포인트에 접근하면 403 에러를 반환한다
