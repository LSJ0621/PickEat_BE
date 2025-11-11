# 네이버 지도 API 역지오코딩 기능 구현 프롬프트

## 개요
사용자가 제공한 위도(latitude)와 경도(longitude)를 네이버 지도 API의 역지오코딩(Reverse Geocoding) 기능을 사용하여 주소 정보로 변환한 후, 변환된 주소 정보를 메뉴명과 함께 검색어로 사용하여 네이버 지역 검색 API를 호출하는 기능을 구현합니다.

## 구현 위치
- **서비스**: `src/search/search.service.ts`
- **기존 메서드 수정**: `searchRestaurants` 메서드

## 구현 단계

### 1. 네이버 지도 API 역지오코딩 엔드포인트 설정
- **API URL**: `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc`
- **HTTP Method**: GET
- **인증**: 네이버 클라우드 플랫폼 API 인증 헤더 사용
  - `X-NCP-APIGW-API-KEY-ID`: `.env` 파일의 `NAVER_MAP_CLIENT_ID` 값 사용 (`process.env.NAVER_MAP_CLIENT_ID`)
  - `X-NCP-APIGW-API-KEY`: `.env` 파일의 `NAVER_MAP_CLIENT_SECRET` 값 사용 (`process.env.NAVER_MAP_CLIENT_SECRET`)
- **쿼리 파라미터**:
  - `coords`: `{longitude},{latitude}` 형식 (예: `127.214138,37.585686`)
  - `output`: `json` (기본값)
  - `orders`: `legalcode,admcode,addr,roadaddr` (주소 정보 우선순위)

### 2. 환경 변수 설정
`.env` 파일에 다음 변수들이 이미 설정되어 있어야 합니다:
- `NAVER_CLIENT_ID`: 네이버 지역 검색 API용 Client ID (기존 사용 중)
- `NAVER_CLIENT_SECRET`: 네이버 지역 검색 API용 Client Secret (기존 사용 중)

**추가로 필요한 환경 변수** (네이버 클라우드 플랫폼 API 인증용):
- `NAVER_MAP_CLIENT_ID`: 네이버 클라우드 플랫폼 Client ID (지도 API용)
  - 헤더 `X-NCP-APIGW-API-KEY-ID`에 사용: `process.env.NAVER_MAP_CLIENT_ID`
- `NAVER_MAP_CLIENT_SECRET`: 네이버 클라우드 플랫폼 Client Secret (지도 API용)
  - 헤더 `X-NCP-APIGW-API-KEY`에 사용: `process.env.NAVER_MAP_CLIENT_SECRET`

**`.env` 파일 예시**:
```env
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
NAVER_MAP_CLIENT_ID=your_naver_map_client_id
NAVER_MAP_CLIENT_SECRET=your_naver_map_client_secret
```

> **참고**: 네이버 지역 검색 API와 네이버 지도 API는 서로 다른 인증 키를 사용할 수 있습니다. 동일한 키를 사용할 수도 있으니 확인이 필요합니다.

### 3. 역지오코딩 API 응답 구조
네이버 지도 API 역지오코딩 응답 예시:
```json
{
  "status": {
    "code": 0,
    "name": "ok",
    "message": "success"
  },
  "results": [
    {
      "name": "legalcode",
      "code": {
        "id": "4113510300",
        "type": "L",
        "mappingId": "4113510300"
      },
      "region": {
        "area0": { "name": "경기도", "coords": {...} },
        "area1": { "name": "남양주시", "coords": {...} },
        "area2": { "name": "와부읍", "coords": {...} },
        "area3": { "name": "도곡리", "coords": {...} },
        "area4": { "name": "", "coords": {...} }
      }
    },
    {
      "name": "admcode",
      "code": {
        "id": "4113510300",
        "type": "A",
        "mappingId": "4113510300"
      },
      "region": {
        "area0": { "name": "경기도", "coords": {...} },
        "area1": { "name": "남양주시", "coords": {...} },
        "area2": { "name": "와부읍", "coords": {...} },
        "area3": { "name": "도곡리", "coords": {...} },
        "area4": { "name": "", "coords": {...} }
      }
    },
    {
      "name": "addr",
      "code": {
        "id": "",
        "type": "",
        "mappingId": ""
      },
      "region": {
        "area0": { "name": "경기도", "coords": {...} },
        "area1": { "name": "남양주시", "coords": {...} },
        "area2": { "name": "와부읍", "coords": {...} },
        "area3": { "name": "도곡리", "coords": {...} },
        "area4": { "name": "", "coords": {...} }
      },
      "land": {
        "type": "",
        "number1": "",
        "number2": "",
        "addition0": { "type": "", "value": "" }
      }
    },
    {
      "name": "roadaddr",
      "code": {
        "id": "",
        "type": "",
        "mappingId": ""
      },
      "region": {
        "area0": { "name": "경기도", "coords": {...} },
        "area1": { "name": "남양주시", "coords": {...} },
        "area2": { "name": "와부읍", "coords": {...} },
        "area3": { "name": "도곡리", "coords": {...} },
        "area4": { "name": "", "coords": {...} }
      },
      "land": null,
      "road": {
        "name": "경춘로",
        "number1": "1234",
        "number2": "5678"
      }
    }
  ]
}
```

### 4. 주소 정보 추출 로직
역지오코딩 API 응답에서 지역명을 추출하는 방법:
1. `results` 배열에서 `name`이 `"roadaddr"`인 항목을 우선적으로 사용
2. 없으면 `name`이 `"addr"`인 항목 사용
3. `region` 객체에서 다음 정보를 추출:
   - `area0.name`: 시/도 (예: "경기도")
   - `area1.name`: 시/군/구 (예: "남양주시")
   - `area2.name`: 읍/면/동 (예: "와부읍")
   - `area3.name`: 리/동 (예: "도곡리")

**검색어에 포함할 주소 형식**:
- 최소: `{시/도} {시/군/구}` (예: "경기도 남양주시")
- 권장: `{시/도} {시/군/구} {읍/면/동}` (예: "경기도 남양주시 와부읍")
- 최대: `{시/도} {시/군/구} {읍/면/동} {리/동}` (예: "경기도 남양주시 와부읍 도곡리")

### 5. 검색어 생성 로직
1. 위도/경도를 역지오코딩하여 주소 정보 추출
2. 추출한 주소 정보를 메뉴명과 결합
   - 형식: `{menuName} {주소정보}`
   - 예시: `"마라탕 경기도 남양주시 와부읍"`
3. 생성된 검색어를 네이버 지역 검색 API의 `query` 파라미터로 사용

### 6. 구현 코드 구조

#### 6.1 DTO 인터페이스 추가
```typescript
interface NaverReverseGeocodeResponse {
  status: {
    code: number;
    name: string;
    message: string;
  };
  results: Array<{
    name: string;
    code?: {
      id: string;
      type: string;
      mappingId: string;
    };
    region: {
      area0: { name: string; coords?: any };
      area1: { name: string; coords?: any };
      area2: { name: string; coords?: any };
      area3: { name: string; coords?: any };
      area4: { name: string; coords?: any };
    };
    land?: any;
    road?: any;
  }>;
}
```

#### 6.2 역지오코딩 메서드 추가
```typescript
private async reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const NAVER_MAP_REVERSE_GEOCODE_URL =
    'https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc';
  const NAVER_MAP_CLIENT_ID =
    process.env.NAVER_MAP_CLIENT_ID || '<<PUT_YOUR_NAVER_MAP_CLIENT_ID_HERE>>';
  const NAVER_MAP_CLIENT_SECRET =
    process.env.NAVER_MAP_CLIENT_SECRET || '<<PUT_YOUR_NAVER_MAP_CLIENT_SECRET_HERE>>';

  try {
    const headers = {
      'X-NCP-APIGW-API-KEY-ID': NAVER_MAP_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': NAVER_MAP_CLIENT_SECRET,
    };
    const params = {
      coords: `${longitude},${latitude}`,
      output: 'json',
      orders: 'legalcode,admcode,addr,roadaddr',
    };
    
    const response = await lastValueFrom(
      this.httpService.get<NaverReverseGeocodeResponse>(
        NAVER_MAP_REVERSE_GEOCODE_URL,
        {
          headers,
          params,
        },
      ),
    );

    return this.extractAddressFromGeocode(response.data);
  } catch (error) {
    // 에러 처리 및 로깅
    return null;
  }
}
```

#### 6.3 주소 정보 추출 메서드 추가
```typescript
private extractAddressFromGeocode(
  response: NaverReverseGeocodeResponse,
): string | null {
  // roadaddr 또는 addr 결과에서 지역명 추출
  // "시/도 시/군/구 읍/면/동" 형식으로 반환
}
```

#### 6.4 searchRestaurants 메서드 수정
```typescript
async searchRestaurants(dto: SearchRestaurantsDto) {
  // 1. 위도/경도로 역지오코딩하여 주소 추출
  const address = await this.reverseGeocode(dto.latitude, dto.longitude);
  
  // 2. 메뉴명과 주소를 결합한 검색어 생성
  const query = address 
    ? `${dto.menuName} ${address}`
    : dto.menuName; // 역지오코딩 실패 시 메뉴명만 사용
  
  // 3. 네이버 지역 검색 API 호출 (기존 로직)
  // params.query에 생성된 검색어 사용
}
```

### 7. 에러 처리
- **역지오코딩 실패 시**: 주소 정보 없이 메뉴명만으로 검색 진행
- **네이버 지도 API 에러**: 로그에 에러 기록 후 메뉴명만으로 검색
- **네이버 지역 검색 API 에러**: 기존 에러 처리 로직 유지

### 8. 로깅
다음 시점에 로그 기록:
- 역지오코딩 요청 시작: `🔍 [역지오코딩 요청] lat={latitude}, lng={longitude}`
- 역지오코딩 성공: `✅ [역지오코딩 응답] address="{추출된 주소}"`
- 역지오코딩 실패: `❌ [역지오코딩 에러] lat={latitude}, lng={longitude}, error={에러 메시지}`
- 최종 검색어: `🔍 [네이버 검색 요청] query="${생성된 검색어}", lat=${latitude}, lng=${longitude}`

### 9. 테스트 케이스
다음 위치로 테스트:
- 위도: 37.585686, 경도: 127.214138 (남양주시)
- 예상 주소: "경기도 남양주시" 또는 "경기도 남양주시 와부읍"
- 검색어: "마라탕 경기도 남양주시" 또는 "마라탕 경기도 남양주시 와부읍"

## 참고 사항
1. 네이버 지도 API는 네이버 클라우드 플랫폼에서 별도로 신청해야 할 수 있습니다.
2. 네이버 지역 검색 API와 네이버 지도 API의 인증 키가 다를 수 있으니 확인이 필요합니다.
3. 역지오코딩 API 호출이 실패하더라도 메뉴명만으로 검색은 가능해야 합니다.
4. 주소 정보 추출 시 빈 문자열(`""`)인 `area` 필드는 제외합니다.

