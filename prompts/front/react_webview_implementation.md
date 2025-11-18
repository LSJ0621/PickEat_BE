# React 웹뷰 구현 가이드

## 개요
React로 웹사이트를 구축하여 Flutter 웹뷰에서 표시하는 프로젝트입니다. 다음 기능들을 구현합니다:
1. 카카오 로그인
2. 메뉴 추천 받기
3. 메뉴 선택 시 주변 식당 검색 및 리스트 표시

## Flutter 웹뷰 고려사항

### 1. 통신 방식
- **Flutter → React**: `window.flutter_inappwebview` 또는 `window.ReactNativeWebView`를 통한 메시지 전달
- **React → Flutter**: `window.flutter_inappwebview.callHandler()` 또는 `window.ReactNativeWebView.postMessage()` 사용
- GPS 위치 정보는 Flutter에서 React로 전달받아야 함

### 2. 토큰 관리
- JWT 토큰은 `localStorage` 또는 `sessionStorage`에 저장
- Flutter 웹뷰와 토큰 공유가 필요한 경우 Flutter에서 전달받거나, React에서 Flutter로 전달

### 3. 환경 변수
- Base URL은 환경 변수로 관리 (개발/프로덕션 분리)
- `.env` 파일 사용 권장

### 4. CORS 설정
- 서버에서 웹뷰 도메인 허용 필요
- 개발 환경: `http://localhost:3000` (또는 웹뷰에서 사용하는 URL)

---

## 1. 카카오 로그인 (웹 방식)

### API 엔드포인트

**URL**: `POST /auth/kakao/doLogin`  
**Base URL**: `http://localhost:3000` (개발 환경) 또는 실제 서버 URL  
**인증**: 불필요

### 카카오 로그인 플로우

1. 카카오 로그인 버튼 클릭
2. 카카오 인증 페이지로 리다이렉트
3. 사용자 로그인 후 인가 코드(`code`) 받기
4. 인가 코드를 서버로 전달
5. 서버에서 카카오 API로 액세스 토큰 교환 후 JWT 토큰 발급

### 요청 구조

#### HTTP 헤더
```
Content-Type: application/json
```

#### 요청 Body (JSON)
```json
{
  "code": "카카오_인가_코드"
}
```

#### 변수명 정리
- `code`: 카카오 로그인 후 받은 인가 코드 (authorization code)

### 응답 데이터 구조

```json
{
  "id": number,
  "token": string,
  "address": string | null,
  "latitude": number | null,
  "longitude": number | null
}
```

#### 변수명 정리
- `id`: 유저 ID
- `token`: JWT 토큰 (이후 API 호출 시 사용)
- `address`: 저장된 주소 (없으면 null)
- `latitude`: 저장된 위도 (없으면 null)
- `longitude`: 저장된 경도 (없으면 null)

### 카카오 로그인 설정

카카오 개발자 콘솔에서 설정:
- **Redirect URI**: `http://localhost:3000/auth/kakao/callback` (개발 환경) 또는 실제 도메인
- **REST API 키**: 카카오 로그인 URL 생성 시 필요

### 구현 예시

#### 1. 카카오 로그인 URL 생성 및 리다이렉트

```typescript
// api/auth.ts
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000';
const KAKAO_REST_API_KEY = process.env.REACT_APP_KAKAO_REST_API_KEY || '';
const KAKAO_REDIRECT_URI = process.env.REACT_APP_KAKAO_REDIRECT_URI || 'http://localhost:3000/auth/kakao/callback';

export interface LoginResponse {
  id: number;
  token: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

// 카카오 로그인 페이지로 리다이렉트
export function redirectToKakaoLogin() {
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code`;
  window.location.href = kakaoAuthUrl;
}

// 인가 코드로 로그인
export async function kakaoLoginWithCode(code: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/kakao/doLogin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error('로그인 실패');
  }

  const data = await response.json();
  
  // JWT 토큰 저장
  localStorage.setItem('jwt_token', data.token);
  localStorage.setItem('user_id', data.id.toString());
  
  return data;
}
```

#### 2. 카카오 로그인 버튼 컴포넌트

```typescript
// components/KakaoLoginButton.tsx
import { redirectToKakaoLogin } from '../api/auth';

const KakaoLoginButton = () => {
  const handleLogin = () => {
    // 카카오 로그인 페이지로 리다이렉트
    redirectToKakaoLogin();
  };

  return (
    <button onClick={handleLogin}>
      카카오 로그인
    </button>
  );
};
```

#### 3. 리다이렉트 후 인가 코드 처리

```typescript
// pages/KakaoCallback.tsx 또는 App.tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { kakaoLoginWithCode } from '../api/auth';

const KakaoCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('카카오 로그인 에러:', error);
      alert('로그인에 실패했습니다.');
      navigate('/login');
      return;
    }

    if (code) {
      // 인가 코드로 로그인 처리
      kakaoLoginWithCode(code)
        .then((loginData) => {
          console.log('로그인 성공:', loginData);
          // 메인 페이지로 이동
          navigate('/');
        })
        .catch((error) => {
          console.error('로그인 실패:', error);
          alert('로그인에 실패했습니다.');
          navigate('/login');
        });
    }
  }, [searchParams, navigate]);

  return <div>로그인 처리 중...</div>;
};
```

### Flutter 웹뷰 고려사항

웹뷰에서 카카오 로그인 시:
- 카카오 로그인 페이지가 웹뷰 내에서 열리거나 외부 브라우저로 열릴 수 있음 (Flutter 설정에 따라)
- 로그인 후 리다이렉트 URI로 돌아와야 함
- 인가 코드는 URL 파라미터(`?code=인가코드`)로 전달됨
- 리다이렉트 URI는 Flutter 웹뷰에서 접근 가능한 URL이어야 함
- 예: `https://yourdomain.com/auth/kakao/callback` 또는 웹뷰 내부 URL

---

## 2. 메뉴 추천 받기

### API 엔드포인트

**URL**: `POST /menu/recommend`  
**Base URL**: `http://localhost:3000` (개발 환경) 또는 실제 서버 URL  
**인증**: JWT 토큰 필요 (Authorization 헤더에 Bearer 토큰 포함)

### 요청 구조

#### HTTP 헤더
```
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
```

#### 요청 Body (JSON)
```json
{
  "prompt": "오늘 기분이 안좋은데 메뉴 추천해줘"
}
```

#### 변수명 정리
- `prompt`: 사용자가 입력한 메뉴 추천 요청 텍스트

### 응답 데이터 구조

```json
{
  "recommendations": [
    "떡볶이",
    "마라탕",
    "치킨"
  ],
  "recommendedAt": "2025-01-15T12:00:00Z"
}
```

#### 변수명 정리
- `recommendations`: 추천된 메뉴 이름 배열
- `recommendedAt`: 추천 받은 시간 (ISO 8601 형식)

### 구현 예시

```typescript
// api/menu.ts
export interface MenuRecommendationResponse {
  recommendations: string[];
  recommendedAt: string;
}

export async function recommendMenu(
  prompt: string,
  token: string
): Promise<MenuRecommendationResponse> {
  const response = await fetch(`${API_BASE_URL}/menu/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      // 토큰 만료 - 로그인 페이지로 리다이렉트
      localStorage.removeItem('jwt_token');
      window.location.href = '/login';
      throw new Error('인증이 만료되었습니다.');
    }
    throw new Error('메뉴 추천 실패');
  }

  return await response.json();
}
```

### 사용 예시

```typescript
// components/MenuRecommendation.tsx
const [recommendations, setRecommendations] = useState<string[]>([]);
const [loading, setLoading] = useState(false);

const handleRecommend = async (prompt: string) => {
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    alert('로그인이 필요합니다.');
    return;
  }

  setLoading(true);
  try {
    const result = await recommendMenu(prompt, token);
    setRecommendations(result.recommendations);
  } catch (error) {
    console.error('메뉴 추천 실패:', error);
    alert('메뉴 추천에 실패했습니다.');
  } finally {
    setLoading(false);
  }
};
```

---

## 3. 메뉴 선택 시 주변 식당 검색

### API 엔드포인트

**URL**: `POST /search/restaurants`  
**Base URL**: `http://localhost:3000` (개발 환경) 또는 실제 서버 URL  
**인증**: JWT 토큰 필요 (Authorization 헤더에 Bearer 토큰 포함)

### 요청 구조

#### HTTP 헤더
```
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
```

#### 요청 Body (JSON)
```json
{
  "menuName": "마라탕",
  "latitude": 37.585686,
  "longitude": 127.214138,
  "includeRoadAddress": false
}
```

#### 변수명 정리
- `menuName`: 선택한 메뉴 이름 (추천된 메뉴 중 하나)
- `latitude`: 사용자의 현재 위도 (Flutter에서 받아옴)
- `longitude`: 사용자의 현재 경도 (Flutter에서 받아옴)
- `includeRoadAddress`: 도로명 주소 포함 여부 (선택, 기본값: false)

### 응답 데이터 구조

```json
{
  "restaurants": [
    {
      "name": "마라탕 전문점",
      "address": "경기도 남양주시 와부읍 덕소리 123-45",
      "roadAddress": "경기도 남양주시 와부읍 덕소로97번길 12",
      "phone": "031-123-4567",
      "mapx": 127214138,
      "mapy": 37585686,
      "distance": 0.5,
      "link": "https://map.naver.com/..."
    }
  ]
}
```

#### 변수명 정리
- `restaurants`: 검색된 식당 리스트 (최대 5개)
  - `name`: 식당 이름
  - `address`: 지번 주소
  - `roadAddress`: 도로명 주소 (있으면 문자열, 없으면 undefined)
  - `phone`: 전화번호 (있으면 문자열, 없으면 undefined)
  - `mapx`: 네이버 지도 X 좌표 (TM 좌표계)
  - `mapy`: 네이버 지도 Y 좌표 (TM 좌표계)
  - `distance`: 사용자 위치로부터의 거리 (km)
  - `link`: 네이버 지도 링크 (있으면 문자열, 없으면 undefined)

### 구현 예시

```typescript
// api/search.ts
export interface Restaurant {
  name: string;
  address: string;
  roadAddress?: string;
  phone?: string;
  mapx?: number;
  mapy?: number;
  distance?: number;
  link?: string;
}

export interface SearchRestaurantsResponse {
  restaurants: Restaurant[];
}

export interface SearchRestaurantsRequest {
  menuName: string;
  latitude: number;
  longitude: number;
  includeRoadAddress?: boolean;
}

export async function searchRestaurants(
  request: SearchRestaurantsRequest,
  token: string
): Promise<SearchRestaurantsResponse> {
  const response = await fetch(`${API_BASE_URL}/search/restaurants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('jwt_token');
      window.location.href = '/login';
      throw new Error('인증이 만료되었습니다.');
    }
    throw new Error('식당 검색 실패');
  }

  return await response.json();
}
```

### Flutter 웹뷰에서 GPS 위치 받기

```typescript
// hooks/useLocation.ts
import { useState, useEffect } from 'react';

interface Location {
  latitude: number;
  longitude: number;
}

export function useLocation(): Location | null {
  const [location, setLocation] = useState<Location | null>(null);

  useEffect(() => {
    // Flutter에서 위치 정보 받기
    const getLocationFromFlutter = async () => {
      if (window.flutter_inappwebview) {
        const locationData = await window.flutter_inappwebview.callHandler('getCurrentLocation');
        if (locationData) {
          setLocation({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
          });
        }
      }
    };

    getLocationFromFlutter();
  }, []);

  return location;
}
```

### 사용 예시

```typescript
// components/RestaurantList.tsx
import { useState } from 'react';
import { useLocation } from '../hooks/useLocation';
import { searchRestaurants } from '../api/search';

const RestaurantList = ({ menuName }: { menuName: string }) => {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const location = useLocation();

  const handleSearch = async () => {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!location) {
      alert('위치 정보를 가져올 수 없습니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await searchRestaurants(
        {
          menuName,
          latitude: location.latitude,
          longitude: location.longitude,
          includeRoadAddress: false,
        },
        token
      );
      setRestaurants(result.restaurants);
    } catch (error) {
      console.error('식당 검색 실패:', error);
      alert('식당 검색에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleSearch} disabled={loading}>
        {loading ? '검색 중...' : '주변 식당 찾기'}
      </button>
      <ul>
        {restaurants.map((restaurant, index) => (
          <li key={index}>
            <h3>{restaurant.name}</h3>
            <p>{restaurant.roadAddress || restaurant.address}</p>
            {restaurant.distance && <p>거리: {restaurant.distance}km</p>}
            {restaurant.phone && <p>전화: {restaurant.phone}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

---

## 전체 플로우 예시

### 1. 로그인 플로우 (웹 방식)
```
1. React에서 카카오 로그인 버튼 클릭
2. 카카오 JavaScript SDK로 로그인 요청
3. 카카오 인증 페이지에서 사용자 로그인
4. 인가 코드(code) 받기
5. React에서 /auth/kakao/doLogin 호출 (인가 코드 전달)
6. 서버에서 카카오 API로 액세스 토큰 교환
7. JWT 토큰 받아서 localStorage에 저장
8. 유저 정보 (주소, 위도/경도) 저장
```

### 2. 메뉴 추천 플로우
```
1. 사용자가 프롬프트 입력 (예: "오늘 기분이 안좋은데 메뉴 추천해줘")
2. POST /menu/recommend 호출 (JWT 토큰 포함)
3. 추천된 메뉴 리스트 받기
4. 화면에 메뉴 리스트 표시
```

### 3. 식당 검색 플로우
```
1. 사용자가 추천된 메뉴 중 하나 선택
2. Flutter에서 현재 위치(GPS) 가져오기
3. React에서 위치 정보 받기
4. POST /search/restaurants 호출 (메뉴명, 위도, 경도 포함)
5. 검색된 식당 리스트 받기
6. 화면에 식당 리스트 표시
```

---

## 에러 처리

### 401 Unauthorized (인증 실패)
```typescript
if (response.status === 401) {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('user_id');
  // 로그인 페이지로 리다이렉트 또는 Flutter에 로그인 필요 알림
  window.location.href = '/login';
  // 또는 Flutter에 메시지 전달
  window.flutter_inappwebview?.callHandler('onAuthExpired');
}
```

### 네트워크 에러
```typescript
try {
  const response = await fetch(...);
  // ...
} catch (error) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    // 네트워크 연결 오류
    alert('인터넷 연결을 확인해주세요.');
  } else {
    // 기타 에러
    console.error('에러:', error);
    alert('오류가 발생했습니다.');
  }
}
```

---

## 환경 변수 설정

### .env 파일
```env
REACT_APP_API_BASE_URL=http://localhost:3000
REACT_APP_KAKAO_REST_API_KEY=your_kakao_rest_api_key
REACT_APP_KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
```

### 환경 변수 설명
- `REACT_APP_API_BASE_URL`: 백엔드 API 서버 URL
- `REACT_APP_KAKAO_REST_API_KEY`: 카카오 개발자 콘솔에서 발급받은 REST API 키
- `REACT_APP_KAKAO_REDIRECT_URI`: 카카오 로그인 후 리다이렉트될 URI (카카오 개발자 콘솔에 등록 필요)

### TypeScript 타입 정의 (선택사항)

```typescript
// types/api.ts
export interface LoginResponse {
  id: number;
  token: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MenuRecommendationResponse {
  recommendations: string[];
  recommendedAt: string;
}

export interface Restaurant {
  name: string;
  address: string;
  roadAddress?: string;
  phone?: string;
  mapx?: number;
  mapy?: number;
  distance?: number;
  link?: string;
}

export interface SearchRestaurantsResponse {
  restaurants: Restaurant[];
}
```

---

## 주의사항

1. **토큰 관리**: JWT 토큰은 안전하게 저장하고, 만료 시 자동 로그아웃 처리
2. **위치 정보**: Flutter에서 GPS 권한 확인 후 위치 정보 전달
3. **에러 처리**: 네트워크 에러, 인증 에러 등 모든 에러 케이스 처리
4. **로딩 상태**: API 호출 중 로딩 상태 표시
5. **웹뷰 통신**: Flutter와의 메시지 통신은 비동기 처리 주의

