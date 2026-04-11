# 사용자 장소 (User Place) 테스트 시나리오

## Backend API 테스트

### 가게 등록 (POST /user-places)
- [x] 정상 등록 (name, address, lat, lng, menuItems, photos) → 201
- [x] 필수 필드 (name) 누락 → 400
- [x] menuItems 빈 배열 → 400
- [x] 이미지 5개 초과 → 400
- [x] 인증 없이 요청 → 401

### 등록 가능 여부 확인 (POST /user-places/check)
- [x] 등록 가능 → 200 + `{ canRegister, dailyRemaining, duplicateExists, nearbyPlaces }`
- [x] 근처에 등록된 장소 있음 → 200 + `nearbyPlaces` 배열에 근접 장소 포함 (duplicateExists는 이름+주소 정확 일치만 감지)

### 가게 목록/상세/수정/삭제
- [x] GET /user-places — 목록 조회 (페이지네이션 + 상태 필터) → 200
- [x] GET /user-places/:id — 상세 조회 → 200
- [x] GET /user-places/:id — 다른 사용자 가게 접근 → 403/404
- [x] PATCH /user-places/:id — 수정 (version 필드 포함, 낙관적 잠금) → 200
- [x] PATCH /user-places/:id — 다른 사용자 가게 수정 → 403
- [x] DELETE /user-places/:id — 삭제 → 200
- [x] DELETE /user-places/:id — 다른 사용자 가게 삭제 → 403
