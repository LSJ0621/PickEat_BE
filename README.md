<div align="center">

# PickEat Backend

AI 기반 맞춤형 메뉴 추천 서비스의 백엔드 API 서버

![PickEat Overview](docs/images/개요%20사진.png)

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--5.1-412991?logo=openai)
![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?logo=google)

</div>

## Key Features

<table>
<tr>
<td align="center" width="50%">
<img src="docs/images/pickeat_취향설정.gif" width="380" />
<br/>
<b>취향 설정</b>
<br/>
<sub>사용자 식사 패턴을 <code>OpenAI Batch API</code>로 비동기 분석하여 선호도를 자동 업데이트합니다.</sub>
</td>
<td align="center" width="50%">
<img src="docs/images/pickeat_메뉴추천.gif" width="380" />
<br/>
<b>AI 메뉴 추천</b>
<br/>
<sub><code>GPT-5.1</code> 2단계 파이프라인으로 맞춤 메뉴를 추천하고, <code>SSE</code> 스트리밍으로 실시간 응답합니다.</sub>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="docs/images/pickeat_store_recommend.gif" width="380" />
<br/>
<b>맛집 추천</b>
<br/>
<sub><code>Gemini Maps Grounding</code>과 <code>Google Places API</code>를 연동하여 주변 맛집을 검색하고 추천합니다.</sub>
</td>
<td align="center" width="50%">
<img src="docs/images/pickeat_store_detail.gif" width="380" />
<br/>
<b>가게 상세</b>
<br/>
<sub>AI가 작성한 가게 설명, 평점, 리뷰 요약을 제공합니다.</sub>
</td>
</tr>
</table>

## Architecture

![PickEat Architecture](docs/images/pickeat_architecture_dark.png)

**Layer**: Controller (요청/응답) → Service (비즈니스 로직) → Repository (데이터) / Client (외부 API)

## ERD

![PickEat ERD](docs/images/pickeat_erd_dark.png)

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | 시스템 아키텍처 및 데이터 흐름 |
| [Backend Structure](docs/backend-structure.md) | 모듈별 구조 및 레이어 설명 |
| [Database Schema](docs/database-schema.md) | 13개 테이블 스키마 및 관계 |
| [API Reference](docs/api-reference.md) | 75개 엔드포인트 명세 |
