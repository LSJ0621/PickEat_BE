# 주소 (Address) 테스트 시나리오

## Backend API 테스트

### 주소 검색 (GET /user/address/search)
- [x] 정상 검색 (query) → 200 + 주소 목록
- [x] 검색 결과 없음 → 200 + 빈 배열
- [x] query 누락 → 400
- [x] 인증 없이 요청 → 401

### 단일 주소 업데이트 (PATCH /user/address)
- [x] 정상 업데이트 (selectedAddress: AddressSearchResult) → 200
- [x] selectedAddress 누락 → 400
- [x] 인증 없이 요청 → 401

### 주소 추가 (POST /user/addresses)
- [x] 새 주소 추가 → 201
- [x] 첫 번째 주소 → isDefault=true, isSearchAddress=true 자동 설정
- [x] 최대 5개 초과 시 → 400 (ADDRESS_MAX_LIMIT)
- [x] 인증 없이 요청 → 401

### 주소 수정 (PATCH /user/addresses/:id)
- [x] 정상 수정 → 200
- [x] 존재하지 않는 id → 404 (ADDRESS_NOT_FOUND)
- [x] 다른 사용자의 주소 수정 → 404
- [x] 인증 없이 요청 → 401

### 주소 일괄 삭제 (POST /user/addresses/batch-delete)
- [x] 비기본 주소 삭제 → 200
- [x] 기본 주소 삭제 시도 → 400 (ADDRESS_CANNOT_DELETE_DEFAULT)
- [x] 존재하지 않는 id → 404 (ADDRESS_NOT_FOUND)
- [x] 다른 사용자의 주소 삭제 → 404
- [x] 인증 없이 요청 → 401

### 기본 주소 설정 (PATCH /user/addresses/:id/default)
- [x] 기본 주소 변경 → 200
- [x] 존재하지 않는 id → 404 (ADDRESS_NOT_FOUND)
- [x] 다른 사용자의 주소를 기본으로 설정 → 404
- [x] 인증 없이 요청 → 401

### 검색 주소 설정 (PATCH /user/addresses/:id/search)
- [x] 검색 주소 변경 → 200
- [x] 존재하지 않는 id → 404 (ADDRESS_NOT_FOUND)
- [x] 다른 사용자의 주소를 검색 주소로 설정 → 404
- [x] 인증 없이 요청 → 401

### 캐시 동작 (Cache HIT)
- [x] 같은 사용자 주소를 2회 조회하면 두 번째는 캐시에서 반환된다

### 기본 주소 자동 전환 (Default address switching)
- [x] 두 번째 주소를 isDefault=true로 추가하면 기존 주소의 isDefault가 false로 변경된다

### 주소 수정 확장 필드 (PATCH /user/addresses/:id - extended fields)
- [x] latitude, longitude, alias를 함께 업데이트할 수 있다

### 검색 주소 플래그 재할당 (Search address flag reassignment)
- [x] searchAddress를 삭제하면 다른 주소에 isSearchAddress 플래그가 재할당된다

### 배치 삭제 시 검색 주소 재할당 (Batch delete with search address reassignment)
- [x] 배치 삭제에서 searchAddress가 포함되면 남은 주소에 플래그가 재할당된다

### 단일 주소 업데이트 경로 (PATCH /user/address - updateSingleAddress paths)
- [x] 주소가 없는 사용자가 요청하면 새 주소를 생성한다 (isDefault=true, isSearchAddress=true)
- [x] 기존 검색 주소가 있으면 해당 주소를 업데이트한다

### 주소 목록 조회 (GET /user/addresses)
- [x] 인증된 사용자 → 200 + 주소 배열
- [x] 주소 없는 사용자 → 200 + 빈 배열
- [x] 인증 없이 요청 → 401
- [x] 다른 사용자의 주소 미포함

### 기본 주소 조회 (GET /user/address/default)
- [x] 기본 주소 존재 → 200 + 기본 주소
- [x] 기본 주소 없음 → 200 + null
- [x] 인증 없이 요청 → 401
- [x] 본인의 기본 주소만 반환

---

## Backend Unit 테스트

### AddressSearchService
- [x] searchWithGoogle — 정상 응답 파싱 (predictions → details → AddressSearchResult[])
- [x] searchWithGoogle — 일부 Details 실패 시 성공한 것만 반환 (Promise.allSettled)
- [x] searchWithGoogle — 결과 없음 → 빈 배열
- [x] mapToAddressResult — 위도/경도 없는 결과 → null 반환
- [x] mapToAddressResult — formattedAddress vs prediction.text 선택 로직
