# 평점 (Rating) 테스트 시나리오

## Backend API 테스트

### 평점 대상 선택 (POST /ratings/select)
- [x] 정상 선택 (placeId, placeName) → 201
- [x] placeId 누락 → 400
- [x] 인증 없이 요청 → 401

### 평점 제출 (POST /ratings/submit)
- [x] 정상 제출 (placeRatingId, rating 1-5) → 200
- [x] rating 0 (하한 미만) → 400
- [x] rating 6 (상한 초과) → 400
- [x] 존재하지 않는 placeRatingId → 404
- [x] 다른 사용자의 placeRatingId 제출 → 403

### 평점 건너뛰기 (POST /ratings/skip)
- [x] 정상 건너뛰기 → 200
- [x] 다른 사용자의 placeRatingId 건너뛰기 → 403

### 평점 무시 (POST /ratings/dismiss)
- [x] 정상 무시 → 200
- [x] 다른 사용자의 placeRatingId 무시 → 403

### 평점 이력 (GET /ratings/history)
- [x] 정상 조회 (페이지네이션) → 200
- [x] 다른 사용자의 평점 미포함 확인
- [x] 날짜 필터 적용 → 해당 날짜만 반환

### 대기 중인 평점 (GET /ratings/pending)
- [x] 대기 중인 가게 목록 반환 → 200
