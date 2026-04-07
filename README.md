# PickEat Backend

AI 기반 맞춤형 메뉴 추천 서비스의 백엔드 API 서버

![PickEat Overview](docs/images/개요%20사진.png)

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)

## Key Features

- **AI 메뉴 추천** — OpenAI GPT-5.1 기반 사용자 맞춤 메뉴 추천 + SSE 실시간 스트리밍 응답
- **AI 맛집 탐색** — Google Gemini Maps Grounding + Google Places API 연동으로 주변 맛집 검색 및 추천
- **선호도 학습** — OpenAI Batch API를 활용한 사용자 식사 패턴 비동기 분석 및 선호도 자동 업데이트
- **소셜 인증** — Kakao/Google OAuth + 이메일 인증 기반 통합 인증 시스템
- **관리자 시스템** — 대시보드, 사용자/알림/버그리포트 관리 + Discord 웹훅 실시간 알림

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | NestJS 11 |
| Language | TypeScript 5.7 (ES2023) |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ORM | TypeORM 0.3 |
| Cache | Redis 7 (ioredis) |
| Auth | JWT + Passport (Kakao, Google OAuth) |
| AI/LLM | OpenAI API (GPT-4o, GPT-5.1), Google Gemini API |
| Search | Google Places API, Google Custom Search Engine |
| Storage | AWS S3 |
| Email | Nodemailer + Handlebars |
| Logging | Pino |
| Testing | Jest 29 |
| Container | Docker (Multi-stage build) |

## Architecture

![PickEat Architecture](docs/images/pickeat_architecture_dark.png)

**Layer**: Controller (요청/응답) → Service (비즈니스 로직) → Repository (데이터) / Client (외부 API)

## Project Structure

```
src/
├── admin/          # 관리자 대시보드, 사용자·설정 관리
├── auth/           # 인증 (JWT, OAuth, 이메일 인증, 비밀번호 재설정)
├── batch/          # OpenAI Batch API 스케줄러 (선호도 분석)
├── bug-report/     # 버그 리포트 + Discord 알림
├── common/         # 공통 모듈 (필터, 데코레이터, 유틸, 설정)
├── external/       # 외부 API 클라이언트 (OpenAI, Google, Gemini, AWS, Kakao, Discord)
├── menu/           # AI 메뉴 추천 + 맛집 검색 (핵심 도메인)
├── migrations/     # TypeORM 마이그레이션
├── notification/   # 알림 관리 + 스케줄러
├── rating/         # 별점 평가 + 집계
├── user/           # 사용자 프로필, 주소, 선호도 관리
└── user-place/     # 사용자 등록 맛집 관리
```

## ERD

![PickEat ERD](docs/images/pickeat_erd_dark.png)

## Docs

| Document | Link |
|----------|------|
| API Documentation | _TODO_ |
| Portfolio | _TODO_ |
