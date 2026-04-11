# 알림 및 관리자 (Admin) 테스트 시나리오

## Backend API 테스트

### 공지사항 관리 (Admin Notification)
- [x] POST /admin/notifications — 공지 생성 (title, content, type) → 201
- [x] GET /admin/notifications — 목록 조회 (페이지네이션 + 필터) → 200
- [x] GET /admin/notifications/:id — 상세 조회 → 200
- [x] PATCH /admin/notifications/:id — 수정 → 200
- [x] DELETE /admin/notifications/:id — 삭제 (soft delete) → 200
- [x] 일반 사용자 접근 → 403

### 대시보드 (Admin Dashboard)
- [x] GET /admin/dashboard/summary — 통계 요약 → 200
- [x] GET /admin/dashboard/recent-activities — 최근 활동 → 200
- [x] GET /admin/dashboard/trends — 트렌드 데이터 (기간 필터) → 200
- [x] 일반 사용자 접근 → 403

### 사용자 관리 (Admin User)
- [x] GET /admin/users — 사용자 목록 (검색, 필터, 정렬) → 200
- [x] GET /admin/users/:id — 사용자 상세 조회 → 200
- [x] PATCH /admin/users/:id/deactivate — 비활성화 → 200
- [x] 비활성화된 사용자의 API 접근 차단 확인
- [x] PATCH /admin/users/:id/activate — 활성화 → 200
- [x] 일반 사용자 접근 → 403

### 사용자 장소 관리 (Admin User Place)
- [x] GET /admin/user-places — 전체 가게 목록 (필터/정렬) → 200
- [x] GET /admin/user-places/:id — 가게 상세 조회 → 200
- [x] PATCH /admin/user-places/:id/approve — 가게 승인 → 200
- [x] PATCH /admin/user-places/:id/reject — 가게 거부 (사유 포함) → 200
- [x] PATCH /admin/user-places/:id — 가게 정보 수정 (이미지 포함) → 200
- [x] 일반 사용자 접근 → 403

### 관리자 설정 (Admin Settings)
- [x] GET /admin/settings/admins — 관리자 목록 → 200
- [x] POST /admin/settings/admins — 관리자 승격 → 201
- [x] DELETE /admin/settings/admins/:id — 관리자 강등 → 200
- [x] ADMIN(SuperAdmin 아닌) 접근 → 403
