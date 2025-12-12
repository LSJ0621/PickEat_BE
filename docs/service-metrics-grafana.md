# Grafana 모니터링 메트릭

모놀리식 배포 환경에서 최소 지표로 장애 감지와 트러블슈팅을 빠르게 하기 위한 리스트입니다.

## 초기 Prometheus/Grafana 설정 요약
- `prom-client` 설치, 전역 `PrometheusModule`/`PrometheusService`/`PrometheusController` (`/metrics`) 생성.
- 기본 프로세스 메트릭(`process_`) 수집, `ai_requests_total`, `ai_tokens_total` Counter 등록.
- Prometheus 스크랩 설정: `monitoring/prometheus/prometheus.yml`에서 `/metrics` 스크랩.
- Grafana 데이터소스: `monitoring/grafana/provisioning/datasources/prometheus.yml`에 Prometheus 설정.
- Grafana 대시보드 프로비저닝 경로: `monitoring/grafana/provisioning/dashboards/`.

## 현재 수집 중
- AI 토큰 사용량: `ai_tokens_total{endpoint="menu|places|preference"}`
- AI 요청 수: `ai_requests_total{endpoint="menu|places", status="ok|error"}` (취향분석 요청 수는 미수집)

## 최종 모니터링 지표 (권장 최소)
- **요청량(RPS)**: 전역 RPS, 핵심 엔드포인트 RPS(메뉴 추천, 가게 추천, 로그인, 토큰 갱신)
- **에러율(HTTP)**: 전역 5xx/4xx 비율, 인증 401/403 비율, 핵심 엔드포인트 오류율(메뉴/가게/로그인/토큰 갱신)
- **응답 시간**: 핵심 엔드포인트 p95(메뉴 추천, 가게 추천, 로그인/토큰 갱신)
- **DB 신호**: db_up(0/1) 헬스 체크 또는 커넥션 풀 pending>0 알람으로 Down 감지, 슬로우 쿼리 건수, 쿼리 오류 수, 커넥션 풀 상태(Active/Pending 또는 획득 대기시간)
- **외부 API 의존성**: OpenAI/Google Places/Google CSE 상태코드 분포(특히 429, 5xx), 지연 p95
- **배치/스케줄러**: 취향 분석 작업 성공/실패/지연 건수

### AI 지연 측정 범위
- `ai_request_duration_seconds`는 “프롬프트 구성 → OpenAI 호출 → 후처리까지 포함한 전체 구간”을 측정 (메뉴/가게/취향 동일 범위).

## 구현 계획 (단계별, 단계마다 테스트 후 진행)
1) **HTTP 계측 추가 (라벨/버킷 최소화)**
   - 작업: 전역 인터셉터로 `http_requests_total{method,route,status}` Counter, `http_request_duration_seconds{method,route}` Histogram 추가. `route`는 템플릿(`/menu/recommend`, `/auth/login` 등) 기반으로 추출해 카디널리티 억제, 쿼리스트링 미포함. 버킷은 0.1, 0.3, 0.5, 1, 2, 5, 10, 20(필요 시 30) 초로 상한 확장. `/metrics` `/health` `/ready` `/live` 등은 계측 제외. 상태코드는 duration 라벨에 붙이지 않고 요청 수 카운터에서만 관리.
   - 테스트: 서버 재시작 → `/metrics`에서 `http_requests_total`/`http_request_duration_seconds` 노출 확인 → `/menu/recommend`, `/auth/login` 등 샘플 요청 후 라벨(method/route/status) 적재, route가 템플릿/쿼리 미포함/unknown fallback 확인, 버킷 집계 정상 확인. `/metrics` 등 제외 경로 미계측 확인.
2) **DB 헬스/슬로우/에러 계측 (경량 체크)**
   - 작업: `db_up` 게이지(헬스 핑 성공=1/실패=0) 주기 제한(30~60초)으로 오버헤드 최소화. 커넥션 풀 pending>0/획득 대기시간 감시. 쿼리 오류 Counter 추가. 슬로우 쿼리 카운터는 옵션으로 표기(정확도·오버헤드 고려 후 필요 시 추가).
   - 테스트: DB 중지/재시작 후 `/metrics`에서 `db_up` 0→1 변동 확인, 의도적 쿼리 오류 발생 시 오류 카운터 증가 확인, 슬로우 쿼리 옵션 추가 시 느린 쿼리로 카운터 증가 확인.
3) **외부 API 계측 (최소 라벨 + timeout 그룹)**
   - 작업: OpenAI/Google Places/Google CSE 호출에 상태코드·지연(ms) Counter/Histogram 추가. 라벨은 `service`(openai|places|cse) + `status_group`(2xx|4xx|5xx|429|timeout)만 사용. 버킷은 0.1, 0.3, 0.5, 1, 2, 5, 10, 20(필요 시 30) 초로 최소화.
   - 구현 주의: 상태그룹 매핑(2xx/4xx/5xx/429/timeout)과 duration 측정(시작~종료) 로직을 헬퍼/공통 유틸로 분리해 OpenAI/Places/CSE 모두 동일 코드 재사용.
   - 테스트: 정상 호출, 의도적 타임아웃/5xx/4xx 유발 후 `external_api_requests_total{service,status_group}` 및 duration Histogram에 라벨/버킷 적재 확인.
4) **배치 계측**
   - 작업: 취향 분석 스케줄 작업 성공/실패/지연 Counter/Gauge 추가. 라벨은 상태(success|fail)와 작업명 정도로 제한.
   - 테스트: 배치 성공/실패 시나리오 실행 후 카운터/Gauge 증가 및 상태 라벨 정상 확인.
5) **잔여 코드 정리**
   - 작업: 미사용 메트릭/라벨/헬퍼 삭제(`ai_cost_total`, `ai_failures_total`, `ai_tokens_total` type 라벨, provider/model 라벨 등)하여 카디널리티·오버헤드 감소. `ai_request_duration_seconds`는 유지(엔드포인트 라벨만).
   - 테스트: `/metrics`에서 제거 대상 메트릭/라벨이 더 이상 노출되지 않는지 확인.
6) **Grafana 대시보드(JSON) 작성**
   - 작업: `monitoring/grafana/provisioning/dashboards/ai-metrics-dashboard.json` 등에 최종 지표 패널 추가(RPS/오류율/p95/DB/db_up/외부 API/배치/AI 토큰/AI 지연). 패널 수 최소화, 쿼리 단순화(sum by 라벨)로 렌더링 부하 억제.
   - 테스트: Grafana에서 프로비저닝된 대시보드 로드 및 각 패널 쿼리 정상 동작, 라벨 규칙 및 버킷 상한 반영 확인.
7) **계측 공통 유틸/헬퍼 분리**
   - 작업: 중복되는 상태그룹 매핑, duration 측정(시작/종료), 라벨 정규화(route 템플릿/unknown) 등을 공통 헬퍼/유틸 파일로 분리하여 HTTP 인터셉터, 외부 API 클라이언트, AI 서비스에서 재사용.
   - 테스트: 공통 헬퍼를 사용하도록 리팩터 후 `/metrics` 라벨 세트가 규칙대로 유지되는지 확인.

### 잔여 코드 정리 대상 예시
- 제거 대상 메트릭/라벨: `ai_cost_total`, `ai_failures_total`, `ai_tokens_total`의 `type` 라벨(prompt/completion), `provider`/`model` 라벨.
- 제거 대상 코드 패턴: prom-client Histogram/Counter 선언 후 미사용, `recordAiRequestDuration`/`incrementAiCost`/`incrementAiFailure` 같은 헬퍼 메서드, 불필요한 라벨을 포함한 `.inc()` 호출, 미등록/미사용된 인터셉터·모듈.

## /metrics 노출 체크리스트
- `ai_tokens_total{endpoint}` Counter: menu/places/preference 라벨만.
- `ai_requests_total{endpoint,status}` Counter: menu/places + ok/error 라벨.
- `ai_request_duration_seconds_bucket|sum|count{endpoint}` Histogram: menu/places/preference 라벨만.
- (추가 예정) `http_requests_total{method,route,status}` Counter: route는 템플릿, 쿼리스트링 미포함, `/metrics` 등 제외.
- (추가 예정) `http_request_duration_seconds_bucket|sum|count{method,route}` Histogram: status 라벨 없음, route 템플릿, 버킷 상한 10~20(또는 30)초.
- (추가 예정) `db_up`, DB pending/acquire wait, DB 쿼리 오류 Counter.
- (추가 예정) 외부 API 지표: `external_api_requests_total{service,status_group}` 및 duration Histogram(버킷 상한 10~20(또는 30)초, status_group에 timeout 포함).
- 알람 시 최소 요청량 조건 확인: 오류율/지연 알람이 최근 5분 N건 이상일 때만 평가되는지 점검.
