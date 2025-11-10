# Pick-Eat Backend Requirements

## 프로젝트 개요
Pick-Eat은 OpenAI API를 활용하여 사용자의 음식 취향을 고려한 맞춤형 식사 메뉴 추천 서비스입니다.

## 주요 기능 요구사항

### 1. 사용자 취향 정보 관리

#### 1.1 회원가입 시 취향 정보 입력
- 사용자가 회원가입 시 음식 취향 및 식사 메뉴 선택 시의 선호도를 태그 형식으로 자유롭게 입력
- 프론트엔드에서 자유로운 형식으로 입력 가능 (예: "매운 음식 선호", "같은 메뉴 반복 싫어함", "스트레스 날 매운 음식")
- 취향 정보 예시:
  - "매운 음식 선호"
  - "같은 메뉴를 연달아 먹는 것을 싫어함"
  - "스트레스 받은 날은 매운 음식을 먹고싶음"
  - "한식 선호"
  - "채식주의"
  - 기타 개인적인 음식 취향 및 제약사항

#### 1.2 취향 정보 저장
- 사용자 엔티티에 취향 정보를 저장
- **데이터베이스 저장 형식: PostgreSQL JSONB 타입 사용**
  - 이유: 태그 형식의 자유로운 입력을 저장하기에 적합하며, 검색 및 확장이 용이함
  - 저장 예시:
    ```json
    {
      "tags": [
        "매운 음식 선호",
        "같은 메뉴 반복 싫어함",
        "스트레스 날 매운 음식",
        "한식 선호"
      ]
    }
    ```
- 취향 정보는 이후 수정 가능해야 함

### 2. AI 메뉴 추천 기능

#### 2.1 메뉴 추천 요청
- 사용자가 메뉴 추천을 요청할 때 프롬프트를 입력
- 프롬프트 예시:
  - "오늘 뭐 기분이 안좋은 일이 있었는데 메뉴 추천해줘"
  - "오늘 날씨가 더운데 뭐 먹을까?"
  - "오늘은 좀 가벼운 거 먹고 싶어"

#### 2.2 AI 추천 로직
- OpenAI API를 사용하여 메뉴 추천
- 입력 정보:
  - 사용자가 입력한 프롬프트
  - 사용자의 취향 정보 (태그 형식으로 저장된 모든 취향 정보)
- 출력:
  - AI가 추천하는 메뉴 리스트 (여러 개의 메뉴 옵션)

#### 2.3 추천 메뉴 이력 저장
- 추천받은 메뉴 리스트를 데이터베이스에 저장
- 마이페이지에서 "어제 추천받은 내용" 등으로 조회 가능
- **데이터베이스 저장 형식: PostgreSQL TEXT[] (배열) + 별도 컬럼 사용**
  - 이유: 메뉴 리스트는 단순 배열이므로 TEXT[]가 더 적합하며, 프롬프트와 날짜는 별도 컬럼으로 관리하여 쿼리와 인덱싱이 명확함
  - 저장 구조:
    - `recommendations`: TEXT[] 타입 - 추천 메뉴 리스트 배열
    - `prompt`: TEXT 타입 - 사용자가 입력한 프롬프트 (별도 컬럼)
    - `recommendedAt`: TIMESTAMP 타입 - 추천 받은 날짜/시간 (별도 컬럼)
  - 저장 예시:
    ```sql
    recommendations: ["떡볶이", "마라탕", "치킨"]
    prompt: "오늘 뭐 기분이 안좋은 일이 있었는데 메뉴 추천해줘"
    recommendedAt: "2025-01-15T12:00:00Z"
    ```
- 추천 이력은 날짜별로 조회 가능해야 함

### 3. 기술 스택 요구사항

#### 3.1 OpenAI API 통합
- OpenAI API 키를 환경 변수로 관리
- OpenAI API를 호출하여 메뉴 추천 기능 구현
- **사용 모델: GPT-5**
  - GPT-5는 코딩 및 에이전트 작업에 최적화된 모델
  - 다양한 규모의 버전 제공 (성능, 비용, 지연 시간에 따라 선택 가능)
  - 메뉴 추천 작업에 적합한 성능 제공
  - 모델명: `gpt-5` (또는 OpenAI API에서 제공하는 정확한 모델명 사용)
- **로깅 요구사항**:
  - OpenAI API 요청 시 다음 정보를 로그로 기록:
    - 요청 URL
    - 요청 헤더 (API 키는 마스킹 처리)
    - 요청 Body (프롬프트, 모델 정보 등)
    - 요청 시간
  - OpenAI API 응답 시 다음 정보를 로그로 기록:
    - 응답 상태 코드
    - 응답 Body (추천 메뉴 리스트 등)
    - 응답 시간
    - 에러 발생 시 에러 메시지 및 스택 트레이스
  - 로깅 목적: 에러 디버깅 및 API 호출 추적을 위해 상세한 로그 기록 필요
  - 로그 레벨: INFO (정상 요청/응답), ERROR (에러 발생 시)

#### 3.2 데이터베이스
- **PostgreSQL 사용**
- 사용자 취향 정보를 데이터베이스에 저장
  - 저장 형식: JSONB 타입
  - 컬럼명: `preferences` (User 엔티티에 추가)
- 메뉴 추천 이력 저장
  - 별도 엔티티: `MenuRecommendation` 또는 `RecommendationHistory`
  - 저장 형식: TEXT[] (배열) + 별도 컬럼
  - 필수 필드:
    - `userId`: 사용자 ID (외래키)
    - `recommendations`: 추천 메뉴 리스트 (TEXT[])
    - `prompt`: 사용자가 입력한 프롬프트 (TEXT)
    - `recommendedAt`: 추천 받은 날짜/시간 (TIMESTAMP)

#### 3.3 NestJS 리소스 생성 가이드
- 새로운 리소스를 추가할 때는 NestJS CLI를 사용하여 생성
- **리소스 생성 명령어**: `nest g resource "리소스 이름"`
  - 예시: `nest g resource menu` 또는 `nest g resource recommendation`
- **API 스타일**: REST API 선택
- **CRUD 엔드포인트 생성 여부**: 
  - Codex가 각 리소스의 요구사항을 분석하여 필요 여부를 판단
  - 모든 CRUD 엔드포인트가 필요한 경우에만 생성
  - 특정 엔드포인트만 필요한 경우 해당 엔드포인트만 구현
  - 예시:
    - MenuRecommendation: CREATE, READ만 필요 (수정/삭제 불필요)
    - User Preferences: CREATE, READ, UPDATE만 필요 (DELETE 불필요)

### 4. API 엔드포인트 요구사항

#### 4.1 취향 정보 관리
- `POST /user/preferences` - 취향 정보 입력/수정
- `GET /user/preferences` - 취향 정보 조회

#### 4.2 메뉴 추천
- `POST /menu/recommend` - 메뉴 추천 요청
  - Request Body:
    ```json
    {
      "prompt": "오늘 뭐 기분이 안좋은 일이 있었는데 메뉴 추천해줘"
    }
    ```
  - Response:
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
  - **동작**: 추천 결과를 자동으로 데이터베이스에 저장

#### 4.3 추천 이력 조회
- `GET /menu/recommendations/history` - 추천 이력 조회
  - Query Parameters:
    - `date` (optional): 특정 날짜의 추천 이력 조회 (YYYY-MM-DD)
  - Response:
    ```json
    {
      "history": [
        {
          "id": 1,
          "recommendations": ["떡볶이", "마라탕", "치킨"],
          "prompt": "오늘 뭐 기분이 안좋은 일이 있었는데 메뉴 추천해줘",
          "recommendedAt": "2025-01-15T12:00:00Z"
        }
      ]
    }
    ```

### 5. 보안 요구사항
- 메뉴 추천 API는 인증된 사용자만 접근 가능
- JWT 토큰을 통한 인증 필요

### 6. 데이터베이스 스키마 설계

#### 6.1 User 엔티티 확장
- `preferences` 컬럼 추가
  - 타입: `jsonb` (PostgreSQL)
  - TypeORM: `@Column('jsonb', { nullable: true })`
  - 저장 형식: `{ "tags": ["태그1", "태그2", ...] }`

#### 6.2 MenuRecommendation 엔티티 생성
- 필수 필드:
  - `id`: Primary Key (number)
  - `userId`: Foreign Key to User (number)
  - `recommendations`: TEXT[] 타입 - 추천 메뉴 리스트 배열
    - TypeORM: `@Column('text', { array: true })` 또는 `@Column('simple-array')`
  - `prompt`: TEXT 타입 - 사용자 입력 프롬프트
  - `recommendedAt`: TIMESTAMP 타입 - 추천 받은 시간
  - `createdAt`: TIMESTAMP 타입 - 생성 시간
  - `updatedAt`: TIMESTAMP 타입 - 수정 시간

### 7. 구현 우선순위
1. User 엔티티에 `preferences` 컬럼 추가 (JSONB 타입)
2. MenuRecommendation 엔티티 생성
3. 취향 정보 입력/수정 API 구현
4. OpenAI API 통합 모듈 생성
5. 메뉴 추천 API 구현 (추천 결과 자동 저장 포함)
6. 프롬프트 + 취향 정보 조합 로직 구현
7. 추천 이력 조회 API 구현

