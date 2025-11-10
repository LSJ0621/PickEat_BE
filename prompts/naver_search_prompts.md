# Pick-Eat Backend – Naver Local Search 연동 프롬프트 (서버에서만 호출)

## 역할

넌 **NestJS + TypeScript** 백엔드만 수정/추가하는 AI 코딩 어시스턴트야.

- 이미 `nest g resource search`로 생성된 리소스(`search.controller.ts`, `search.service.ts`, DTO들)가 있다고 가정한다.
- **새로운 모듈을 크게 만들지 말고**, `search` 리소스 안에만 코드를 추가/수정해서 구현해라.
- 프론트(Flutter) 코드는 건드리지 말고, **서버에서만 네이버 Open API에 요청을 보내고 응답을 받아오는 부분만 구현**해라.

---

## 목적 및 사용 시나리오

### 사용 플로우
1. 사용자가 메뉴 추천을 받으면 **메뉴 리스트**가 반환됨 (예: ["떡볶이", "마라탕", "치킨"])
2. 사용자가 **특정 메뉴를 선택(터치)**하면
3. 프론트엔드(Flutter)가 **선택한 메뉴명 + 사용자의 현재 위치(위도/경도)**를 서버에 전송
4. 서버(NestJS)는 이 정보를 이용해 **네이버 지역 검색(Local Search) API**를 호출하여,
   - 해당 메뉴를 파는 **주변 가게 리스트**를 가져와서
   - Flutter가 지도에 뿌리기 좋은 JSON 형태로 반환한다.

### 요청 정보
- **메뉴 이름**: 사용자가 선택한 메뉴명 (예: "떡볶이")
- **위치 정보**: 사용자의 현재 위치
  - `latitude` (위도)
  - `longitude` (경도)

### 클라이언트 아이디 / 시크릿
- 클라이언트 아이디 / 시크릿 값은 **내가 직접 코드/환경변수에 넣을 것이므로**,  
  너는 **상수/플레이스홀더만 만들어두면 된다.**

---

## 네이버 지역 검색 API 정보

- 엔드포인트: `https://openapi.naver.com/v1/search/local.json`
- HTTP 메소드: `GET`
- 헤더:
  - `X-Naver-Client-Id: <내가 넣을 값>`
  - `X-Naver-Client-Secret: <내가 넣을 값>`
- 쿼리 파라미터:
  - `query`: 검색어 (여기서는 **선택된 메뉴명**, 예: "떡볶이")
  - `display`: 가져올 갯수 (1~5 정도, 기본 5로 사용 가능)
  - `sort`: 정렬 방식 (거리순: "random" 또는 "comment", 기본값 사용 가능)

### 위치 정보 활용
- 네이버 지역 검색 API는 위치 정보를 직접 쿼리 파라미터로 받지 않지만,
- 검색 결과에 거리 정보가 포함되어 반환됨
- 필요시 프론트엔드에서 받은 위치 정보와 검색 결과의 위치를 비교하여 거리 계산 가능

---

## 구현 요구사항

### 1. DTO 구조
요청 DTO는 다음과 같은 구조여야 함:
```typescript
{
  menuName: string;      // 선택된 메뉴명 (예: "떡볶이")
  latitude: number;       // 사용자 현재 위치 - 위도
  longitude: number;      // 사용자 현재 위치 - 경도
}
```

### 2. API 엔드포인트
- `POST /search/restaurants` 또는 `POST /search/local`
- JWT 인증 필요 (사용자 인증 확인)
- 요청 Body에 위 DTO 구조 사용

### 3. 응답 형식
Flutter가 지도에 표시하기 좋은 형태로 반환:
```typescript
{
  restaurants: [
    {
      name: string;           // 가게명
      address: string;        // 주소
      roadAddress?: string;   // 도로명 주소 (있으면)
      phone?: string;         // 전화번호 (있으면)
      mapx?: number;          // X 좌표 (네이버 지도용)
      mapy?: number;          // Y 좌표 (네이버 지도용)
      distance?: number;      // 거리 (km, 계산 가능하면)
      link?: string;          // 네이버 링크
    }
  ]
}
```

### 4. 코드 예시 (상수 정의)
너는 코드 안에 예를 들어 이렇게 상수를 만들어 두기만 하면 된다:

```ts
const NAVER_LOCAL_SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json';

// 실제 값은 내가 채울 예정 (환경변수 사용 권장)
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '<<PUT_YOUR_NAVER_CLIENT_ID_HERE>>';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '<<PUT_YOUR_NAVER_CLIENT_SECRET_HERE>>';
```

### 5. 에러 처리
- 네이버 API 호출 실패 시 적절한 에러 메시지 반환
- 메뉴명이 없거나 위치 정보가 없으면 400 Bad Request
- 네이버 API 인증 실패 시 500 Internal Server Error
- 네이버 API에서 결과가 없을 경우 빈 배열 반환

### 6. 로깅
- 네이버 API 요청/응답 로그 기록 (민감한 정보는 마스킹)
- 요청한 메뉴명과 위치 정보 로그
- OpenAI 로그와 유사한 형식으로 가독성 좋게 작성 (이모지 사용 권장)
  - 예: `🔍 [네이버 검색 요청]`, `✅ [네이버 검색 응답]`, `❌ [네이버 검색 에러]`

### 7. 거리 계산 (선택사항)
- 네이버 API 응답에 거리 정보가 없을 경우,
- 사용자 위치(latitude, longitude)와 가게 위치를 이용해 거리 계산 가능
- Haversine 공식 등을 사용하여 km 단위로 계산
