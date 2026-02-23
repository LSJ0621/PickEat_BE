# Archived Code - pick-eat_be

Naver/Search/Kakao-Local 코드가 Google 전환 완료 후 보관됨 (2026-02-13).

## 보관된 파일

| 보관 위치 | 원래 위치 | 설명 |
|-----------|----------|------|
| `external/naver/clients/naver-map.client.ts` | `src/external/naver/clients/naver-map.client.ts` | 네이버 지도 API 클라이언트 |
| `external/naver/clients/naver-search.client.ts` | `src/external/naver/clients/naver-search.client.ts` | 네이버 검색 API 클라이언트 |
| `external/naver/services/location.service.ts` | `src/external/naver/services/location.service.ts` | 위치 서비스 |
| `external/naver/naver.module.ts` | `src/external/naver/naver.module.ts` | 네이버 모듈 |
| `external/naver/naver.constants.ts` | `src/external/naver/naver.constants.ts` | 네이버 API 상수 |
| `external/naver/naver.types.ts` | `src/external/naver/naver.types.ts` | 네이버 API 타입 |
| `search/search.controller.ts` | `src/search/search.controller.ts` | 검색 컨트롤러 |
| `search/search.module.ts` | `src/search/search.module.ts` | 검색 모듈 |
| `search/search.service.ts` | `src/search/search.service.ts` | 검색 서비스 |
| `search/dto/search-restaurants.dto.ts` | `src/search/dto/search-restaurants.dto.ts` | 검색 DTO |
| `search/interfaces/search.interface.ts` | `src/search/interfaces/search.interface.ts` | 검색 인터페이스 |
| `external/kakao/clients/kakao-local.client.ts` | `src/external/kakao/clients/kakao-local.client.ts` | 카카오 주소 검색 클라이언트 |
| `user/interfaces/kakao-local.interface.ts` | `src/user/interfaces/kakao-local.interface.ts` | 카카오 로컬 인터페이스 |

## 복원 방법

1. 파일을 원래 위치로 복사
2. 해당 모듈에 import 추가 (app.module.ts, external.module.ts 등)
3. env.validation.ts에 환경변수 검증 추가
4. .env에 필요한 환경변수 설정
