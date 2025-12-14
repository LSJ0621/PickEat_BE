# Grafana 대시보드 개선 계획

## 문제점

1. **AI 요청 수 위치 오류**: AI 요청 수 패널(id: 11)이 지연율 섹션 아래에 위치함 → HTTP 요청 섹션으로 이동 필요
2. **가독성 문제**: 2열로 여러 행으로 배치되어 가독성이 떨어짐 → 레이아웃 개선 필요
3. **No Data 문제**: 첫 요청이 갔는데 0으로 나오면서 no data에서 그래프가 나타남 → PromQL 쿼리 수정 필요

## 개선 계획

### 1. AI 요청 수 패널 이동 및 레이아웃 개선

**현재 구조**:
- HTTP 요청 섹션: 인증, 사용자, 메뉴, 검색, 지도 (5개, 2열)
- HTTP 지연율 섹션: 인증, 사용자, 메뉴, 검색, 지도 (5개, 2열)
- AI 요청 수: 지연율 섹션 아래 (y: 74)

**개선 후 구조**:
- HTTP 요청 섹션: 인증, 사용자, 메뉴, 검색, 지도, AI (6개, 3열 2행)
- HTTP 지연율 섹션: 인증, 사용자, 메뉴, 검색, 지도, AI (6개, 3열 2행)

**레이아웃 변경**:
- 기존: 2열 (w: 12)
- 변경: 3열 (w: 8) - 더 많은 패널을 한 화면에 표시

### 2. No Data 문제 해결

**원인**:
- Prometheus Counter는 값이 없으면 메트릭이 노출되지 않음
- `increase()` 함수는 데이터가 없을 때 null 반환
- 첫 요청이 오면 Counter가 0에서 시작하여 첫 값이 표시됨

**해결 방법**:
- 모든 `increase()` 쿼리에 `or vector(0)` 추가
- 데이터가 없을 때 0으로 표시되도록 설정

**수정 대상 쿼리**:
```promql
# 수정 전
sum(increase(http_requests_total{route=~"/auth.*"}[$__range])) by (route, status)

# 수정 후
sum(increase(http_requests_total{route=~"/auth.*"}[$__range])) by (route, status) or vector(0)
```

### 3. AI 요청 수 쿼리 변경

**현재**: `rate()` 사용 (초당 요청 수)
**변경**: `increase()` 사용 (실제 요청 수) + `or vector(0)` 추가

```promql
# 수정 전
sum(rate(ai_requests_total[5m])) by (endpoint, status)

# 수정 후
sum(increase(ai_requests_total[$__range])) by (endpoint, status) or vector(0)
```

## 구현 단계

1. ✅ AI 요청 수 패널을 HTTP 요청 섹션으로 이동
2. ✅ 레이아웃을 3열로 변경 (w: 8)
3. ✅ 모든 increase() 쿼리에 `or vector(0)` 추가
4. ✅ AI 요청 수 쿼리를 increase()로 변경
5. ✅ 패널들의 y 위치 재조정
6. ✅ nullValueMode 설정 확인 및 추가

## 예상 레이아웃

### HTTP 요청 섹션 (y: 8-25)
```
Row: HTTP 요청 (y: 8)
Row 1: [인증] [사용자] [메뉴] (y: 9, w: 8)
Row 2: [검색] [지도] [AI] (y: 17, w: 8)
```

### HTTP 지연율 섹션 (y: 26-43)
```
Row: HTTP 요청 지연율 (y: 26)
Row 1: [인증] [사용자] [메뉴] (y: 27, w: 8)
Row 2: [검색] [지도] [AI] (y: 35, w: 8)
```

## 추가 개선사항

- `nullValueMode: "null as zero"` 설정을 모든 패널에 추가
- `fieldConfig.defaults`에 `nullValueMode` 추가

