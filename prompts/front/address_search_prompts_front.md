# 주소 검색 및 저장 API 사용 가이드 (Flutter)

## 개요
사용자가 주소를 검색하고, 검색 결과 중 하나를 선택하여 자신의 주소로 저장하는 기능입니다.

---

## 1. 주소 검색 API

### 요청
- **메서드**: `GET`
- **URL**: `/user/address/search`
- **인증**: JWT 토큰 필요 (Authorization 헤더에 `Bearer {token}`)
- **Headers**:
  - `Authorization: Bearer {JWT_TOKEN}`
- **Query 파라미터**:
  - `query` (string, 필수): 검색할 주소

### 응답 데이터 구조

```json
{
  "meta": {
    "total_count": number,
    "pageable_count": number,
    "is_end": boolean
  },
  "addresses": [
    {
      "address": string,           // 지번 주소
      "roadAddress": string | null,  // 도로명 주소 (없으면 null)
      "postalCode": string | null,   // 우편번호 (없으면 null)
      "latitude": string,            // 위도 (표시하지 않음)
      "longitude": string            // 경도 (표시하지 않음)
    }
  ]
}
```

### 변수명 정리
- `meta.total_count`: 전체 검색 결과 수
- `meta.pageable_count`: 현재 페이지에서 조회 가능한 결과 수
- `meta.is_end`: 마지막 페이지 여부 (true/false)
- `addresses`: 주소 배열 (최대 10개)
  - `address`: 지번 주소 (항상 존재)
  - `roadAddress`: 도로명 주소 (있으면 문자열, 없으면 null)
  - `postalCode`: 우편번호 (도로명 주소가 있을 때만 존재, 없으면 null)
  - `latitude`: 위도 (표시하지 않음, 저장용)
  - `longitude`: 경도 (표시하지 않음, 저장용)

---

## 2. 주소 저장 API

### 요청
- **메서드**: `PATCH`
- **URL**: `/user/address`
- **인증**: JWT 토큰 필요 (Authorization 헤더에 `Bearer {token}`)
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer {JWT_TOKEN}`
- **Body**:
```json
{
  "selectedAddress": {
    "address": string,           // 지번 주소
    "roadAddress": string | null, // 도로명 주소 (없으면 null)
    "postalCode": string | null,  // 우편번호 (없으면 null)
    "latitude": string,           // 위도
    "longitude": string           // 경도
  }
}
```

### 응답 데이터 구조

```json
{
  "address": string  // 저장된 주소 (도로명 주소 우선, 없으면 지번 주소)
}
```

### 변수명 정리
- `selectedAddress`: 검색 결과에서 선택한 주소 객체
  - `selectedAddress.address`: 지번 주소
  - `selectedAddress.roadAddress`: 도로명 주소
  - `selectedAddress.postalCode`: 우편번호
  - `selectedAddress.latitude`: 위도 (서버에서 저장됨)
  - `selectedAddress.longitude`: 경도 (서버에서 저장됨)
- 응답의 `address`: 저장된 주소 (도로명 주소가 있으면 도로명 주소, 없으면 지번 주소)

---

## 저장 규칙
- 도로명 주소(`roadAddress`)가 있으면 → 도로명 주소 저장
- 도로명 주소(`roadAddress`)가 없으면 → 지번 주소(`address`) 저장

---

## 주의사항
1. 검색 결과는 최대 10개까지 반환됩니다
2. `roadAddress`가 `null`인 경우: 도로명 주소가 없는 지역 (동 단위 주소 등)
3. `postalCode`가 `null`인 경우: 도로명 주소가 없어서 우편번호도 없음
4. 주소 저장 시 검색 결과의 주소 객체를 그대로 `selectedAddress`로 전송하면 됩니다
