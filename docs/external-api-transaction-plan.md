# 외부 API 연쇄 호출 트랜잭션 플랜

## 배경
- 일반 검색: 역지오코딩(Naver Map) → 로컬 검색(Naver Search) 순차 호출. 역지오코딩 실패 시 `null`로 이어져 검색이 진행되는 등 fail-fast 부재.
- 가게 추천: Google Places 검색 → LLM 추천(OpenAI) → 추천 결과 DB 저장. 중간 실패 시 이후 단계가 멈추지만 단계별 상태 기록/표준화된 예외 처리, DB 트랜잭션 경계가 명확하지 않음.
- 외부 API 응답 지연/오류 시 다음 단계 차단과 상태 관리를 일관되게 적용할 필요가 있음.

## 목표
- 한 요청 내 다단계 외부 호출을 **단일 프로세스(pipeline)** 로 관리해, 특정 단계 실패 시 이후 단계를 실행하지 않고 즉시 중단(fail-fast).
- 실패 시 표준화된 예외(`ExternalApiException` 등)와 로그/메트릭을 남겨 추적 가능하게 함.
- 모든 외부 호출이 성공한 경우에만 DB에 저장하며, 별도 트랜잭션은 사용하지 않음(저장 단계가 마지막 단일 스텝).
- 요청 단위 상관관계 ID를 부여해 단계별 로그를 묶어 추적.

## 대상 플로우
- 일반 검색: ReverseGeocode(NaverMap) → LocalSearch(NaverSearch).
- 가게 추천: TextSearch(Google Places) → Recommend(OpenAI) → Persist(PlaceRecommendation).
- 기타 단일 호출(Place Detail, Blog Search 등)은 동일한 예외·로깅 규약만 맞추고 필요 시 단일 스텝 파이프라인으로 래핑.

## 설계 개요
1) **Pipeline Orchestrator (서비스 계층 전용)**
   - 입력: 스텝 배열, 초기 컨텍스트(요청 정보, correlationId, user/menu info).
   - 동작: 스텝을 순차 실행, 실패 시 즉시 중단 후 `PipelineFailedException` 래핑. 성공 시 최종 결과 반환.
   - 출력: 최종 결과 + 스텝별 실행 로그/타이밍 정보(메트릭 발행용 훅 포함).
2) **Step 인터페이스**
   - `name`, `run(ctx)`, 선택적 `onError(error, ctx)`, `onFinally(ctx)`.
   - 외부 API 호출 스텝은 클라이언트 호출 + 실패 시 `ExternalApiException` throw. 재시도/타임아웃은 클라이언트 설정에 위임.
   - DB 관련 스텝은 **TypeORM 트랜잭션** 래핑 내부에서 실행.
3) **Context/State**
   - 요청 단위 `correlationId`, 메뉴/위치 등 입력, 중간 산출물 저장 필드(`address`, `places`, `recommendations` 등).
   - 스텝 간 데이터 전달은 컨텍스트 객체로 일원화; 임시 값이 외부로 새어 나가지 않도록 서비스 내부 범위에 한정.
4) **로깅/메트릭**
   - 스텝 시작/성공/실패 로그에 `correlationId`, `step`, `duration` 포함.
   - 실패 시 예외 타입, 외부 API status code, response body 요약 로그.
   - Prometheus/Grafana용 스텝별 성공/실패 카운터, 지연 시간 히스토그램 발행 지점 준비.

## 플로우별 적용 설계
### 1) 일반 검색 파이프라인
- Steps
  1. `ReverseGeocodeStep`: Naver Map reverseGeocode 호출, 주소 없으면 **즉시 예외**(검색 미진행). 결과를 `ctx.address`에 저장.
  2. `NaverLocalSearchStep`: `ctx.address`와 메뉴명을 합성한 쿼리로 Naver Search 호출. **검색 결과가 0개면 예외**를 던져 응답으로 “검색 결과 없음” 전달. 결과를 `ctx.restaurants`에 저장.
- 결과: `{ restaurants: ctx.restaurants }`.
- DB 트랜잭션: 없음(읽기 전용).

### 2) 가게 추천 파이프라인
- Steps
  1. `GooglePlacesSearchStep`: textSearch로 후보 조회 → `ctx.places`. **결과가 0개면 예외**(다음 스텝 미실행).
  2. `LlmRecommendStep`: OpenAI에 후보 전달 → `ctx.recommendations`. **LLM이 추천 0개 반환 시 예외**(추천 불가 케이스 명시).
  3. `PersistRecommendationsStep`: PlaceRecommendation 저장. 외부 호출이 모두 성공한 경우에만 실행하며, 별도 트랜잭션 없이 단일 저장 스텝으로 종료.
- 실패 처리: 각 스텝 `ExternalApiException` 또는 `BadRequestException` 던짐 → Orchestrator가 즉시 중단, 이후 스텝 미실행.
- 결과: `{ recommendations: ctx.recommendations }`.

## 실패/재시도/타임아웃 정책
- **타임아웃**: HttpService/axios 레벨에서 강제(예: 3s~5s) 후 `ExternalApiException`.
- **재시도**: 외부 API 429/5xx에 한해 제한적 재시도(예: 1~2회, 지수 백오프). 파이프라인 레벨 재시도는 없음.
- **단계별 예외 변환**: 모든 외부 호출 실패는 `ExternalApiException(provider, error, message)`로 변환해 전역 필터에서 처리.
- **빈 결과 예외**: 검색 결과 0건 또는 LLM 추천 0건도 의도적으로 예외를 발생시켜 다음 스텝을 중단하고 사용자에게 “결과 없음/추천 불가” 응답.
- **보상 트랜잭션**: 별도 보상/트랜잭션 없음. 저장은 모든 외부 호출 성공 후 단일 스텝으로 수행.

## 구현 체크리스트
- [ ] 공통 Pipeline 유틸 추가 (`src/common/pipeline/pipeline.ts` 등): 스텝 실행, 컨텍스트, 로깅 훅, 메트릭 훅.
- [ ] 일반 검색을 파이프라인으로 리팩터링: `MapService.reverseGeocode` 실패 시 예외 반환으로 변경, `SearchService.searchRestaurants`에서 파이프라인 실행.
- [ ] 가게 추천 파이프라인 도입: `PlaceService.executeRecommendation` 분리 → 파이프라인 실행 후 DB 저장 스텝은 트랜잭션 처리.
- [ ] 스텝별 로깅/메트릭 포맷 정의 및 적용(Prometheus 히스토그램/카운터).
- [ ] 통합/단위 테스트 추가: 스텝별 실패 시 다음 스텝 미실행, DB 스텝 롤백 검증, 예외 타입 검증.
- [ ] 문서/ENV 확인: 외부 API 타임아웃/재시도 설정값 `.env` 및 `constants`에 정리.

## 롤아웃 계획
- 1차: 공통 파이프라인 유틸 릴리스 + 일반 검색 적용 (읽기 전용, 회귀 위험 낮음).
- 2차: 가게 추천 파이프라인 적용 + DB 트랜잭션 추가.
- 3차: 메트릭/로그 대시보드 정비, 알림 임계치 설정.
- 4차: 운영 피드백 기반 타임아웃/재시도 파라미터 튜닝.

