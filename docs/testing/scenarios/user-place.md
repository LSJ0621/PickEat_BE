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

### 가게 등록 - 영업시간 (POST /user-places - businessHours)
- [x] businessHours를 정상 입력하면 201 + businessHours가 저장된다
- [x] isOpen247=true이면 영업시간 상세 없이 201을 반환한다

### 가게 등록 - 중복/한도 검증 (POST /user-places)
- [x] 같은 이름+주소로 중복 등록하면 400 + DUPLICATE_REGISTRATION을 반환한다
- [x] 일일 등록 한도를 초과하면 400 + DAILY_LIMIT_EXCEEDED를 반환한다

### 가게 목록/상세/수정/삭제
- [x] GET /user-places — 목록 조회 (페이지네이션 + 상태 필터) → 200
- [x] GET /user-places/:id — 상세 조회 → 200
- [x] GET /user-places/:id — 다른 사용자 가게 접근 → 403/404
- [x] PATCH /user-places/:id — 올바른 version이면 200 + 수정된 가게를 반환한다
- [x] PATCH /user-places/:id — APPROVED 상태 가게를 수정하면 403 + NOT_EDITABLE을 반환한다
- [x] PATCH /user-places/:id — version 불일치 시 409 + OPTIMISTIC_LOCK_FAILED를 반환한다
- [x] PATCH /user-places/:id — 사진 부분 업로드 + existingPhotos 검증
- [x] PATCH /user-places/:id — 다른 사용자 가게 수정 → 403
- [x] DELETE /user-places/:id — 삭제 → 200
- [x] DELETE /user-places/:id — 다른 사용자 가게 삭제 → 403
