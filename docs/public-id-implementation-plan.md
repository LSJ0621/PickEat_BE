# 외부 노출용 유저 고유식별자(Public ID) 구현 계획

## 목적
보안을 위해 내부적으로는 auto-increment ID를 사용하되, 외부 API 응답 및 요청에는 난수값으로 된 고유식별자를 사용하여 사용자 수나 데이터 구조를 추측할 수 없도록 함.

## 기술 스택
- **UUID v4**: 표준적이고 충돌 가능성이 거의 없는 난수값 생성
- **TypeORM**: `@Column({ type: 'uuid', generated: 'uuid' })` 또는 `@BeforeInsert` 훅 사용
- **PostgreSQL**: UUID 타입 네이티브 지원 (16바이트)

## UUID v4 사용 시 고려사항

### 저장 공간
- **UUID v4**: 16바이트 (128비트)
- **INT (현재 id)**: 4바이트
- **BIGINT**: 8바이트
- **차이**: 사용자당 12바이트 추가 (INT 대비)
- **예시**: 100만 사용자 = 약 12MB 추가 저장 공간 (무시 가능한 수준)

### 인덱스 성능
- **문제점**: UUID v4는 완전 랜덤이므로 B-tree 인덱스에서 페이지 분할(fragmentation) 발생 가능
- **영향**: 대량 삽입 시 인덱스 성능 저하 가능
- **해결책**: 
  - PostgreSQL의 경우 UUID 타입이 최적화되어 있어 실질적 영향은 미미
  - 인덱스 재구성 주기적 실행으로 해결 가능
  - 대안: ULID 사용 (순차적 생성)

### 대안 비교

#### 1. UUID v4 (현재 계획)
- **장점**: 표준적, 완전 랜덤, 예측 불가능
- **단점**: 인덱스 성능 이슈 가능 (실제로는 미미)
- **저장 공간**: 16바이트
- **추천도**: ⭐⭐⭐⭐ (보안 우선 시)

#### 2. ULID (권장 대안)
- **형식**: 타임스탬프(48bit) + 랜덤(80bit) = 26자 문자열
- **장점**: 
  - 순차적 생성으로 인덱스 성능 우수
  - 타임스탬프 포함 (정렬 가능)
  - UUID보다 짧음 (26자 vs 36자)
- **단점**: 타임스탬프 포함으로 약간의 정보 노출 가능
- **저장 공간**: 16바이트 (동일)
- **추천도**: ⭐⭐⭐⭐⭐ (성능 + 보안 균형)

#### 3. nanoid
- **형식**: URL-safe 문자열 (기본 21자)
- **장점**: 매우 짧음, URL-safe
- **단점**: 표준이 아님, 충돌 가능성 약간 높음
- **저장 공간**: 약 21바이트 (문자열)
- **추천도**: ⭐⭐⭐ (간결함 우선 시)

### 권장 사항
**PostgreSQL 사용 시 ULID 권장**:
- 인덱스 성능 우수 (순차적 생성)
- 보안성 유지 (타임스탬프는 대략적인 생성 시간만 노출)
- 표준에 가까움 (UUID 기반)
- 저장 공간 동일 (16바이트)

**UUID v4도 충분히 사용 가능**:
- PostgreSQL의 UUID 타입 최적화로 실질적 성능 차이 미미
- 표준적이고 널리 사용됨
- 완전 랜덤으로 보안성 최고

## 구현 단계

### Phase 1: 의존성 추가 및 엔티티 수정

#### 1.1 UUID 패키지 설치
```bash
pnpm add uuid
pnpm add -D @types/uuid
```

#### 1.2 User 엔티티 수정
- `publicId` 필드 추가 (UUID 타입, unique, indexed)
- `@BeforeInsert` 훅으로 자동 생성
- 기존 `id`는 내부용으로 유지

#### 1.3 SocialLogin 엔티티 수정
- 동일하게 `publicId` 필드 추가

### Phase 2: 데이터베이스 마이그레이션

#### 2.1 마이그레이션 생성
- `publicId` 컬럼 추가 (UUID 타입)
- Unique 제약조건 추가
- Index 생성

#### 2.2 기존 데이터 처리
- 기존 레코드에 대한 `publicId` 생성 스크립트 작성
- 배치 업데이트 실행

### Phase 3: DTO 및 인터페이스 수정

#### 3.1 AuthResult 인터페이스
- `id: number` → `publicId: string` 변경

#### 3.2 AuthUserPayload 인터페이스
- `sub?: number` → `sub?: string` (publicId 사용) 또는
- `publicId?: string` 추가

#### 3.3 모든 응답 DTO 수정
- `id` 필드를 `publicId`로 변경
- `userId` 참조도 `userPublicId`로 변경 (필요시)

### Phase 4: 서비스 레이어 수정

#### 4.1 UserService
- `findByPublicId(publicId: string)` 메서드 추가
- `findOne(id: number)`는 내부용으로 유지
- 모든 외부 노출 메서드에서 `publicId` 사용

#### 4.2 AuthService
- JWT 페이로드에 `publicId` 포함
- `buildAuthResult`에서 `publicId` 반환
- `validateUser` 등 내부 로직은 기존 `id` 유지

#### 4.3 MenuService
- `userId` 참조를 `publicId`로 변경
- 조회 시 `findByPublicId` 사용

### Phase 5: 컨트롤러 수정

#### 5.1 UserController
- `@Param('id')` → `@Param('publicId')` 변경
- `findOne`에서 `findByPublicId` 사용

#### 5.2 AuthController
- 응답에서 `publicId` 반환
- JWT 페이로드에 `publicId` 포함

#### 5.3 MenuController
- 사용자 조회 시 `publicId` 사용

### Phase 6: JWT 전략 수정

#### 6.1 JwtStrategy
- 페이로드에서 `publicId` 추출
- `validate` 메서드에서 `findByPublicId` 사용

#### 6.2 JwtTokenProvider
- 토큰 생성 시 `publicId` 포함

### Phase 7: 관계 엔티티 처리

#### 7.1 MenuSelection, MenuRecommendation
- 외부 노출 시 `user.id` 대신 `user.publicId` 사용
- 내부 조회는 기존 `userId` 유지

### Phase 8: 테스트 및 검증

#### 8.1 단위 테스트
- `findByPublicId` 메서드 테스트
- DTO 변환 테스트

#### 8.2 E2E 테스트
- 인증 플로우 테스트
- API 응답에 `publicId` 포함 확인
- 기존 `id`가 노출되지 않음 확인

## 파일 수정 목록

### 엔티티
- `src/user/entities/user.entity.ts`
- `src/user/entities/social-login.entity.ts`

### 인터페이스
- `src/auth/auth.service.ts` (AuthResult, AuthProfile)
- `src/auth/decorators/current-user.decorator.ts` (AuthUserPayload)

### 서비스
- `src/user/user.service.ts`
- `src/auth/auth.service.ts`
- `src/menu/menu.service.ts`

### 컨트롤러
- `src/user/user.controller.ts`
- `src/auth/auth.controller.ts`
- `src/menu/menu.controller.ts`

### 전략
- `src/auth/strategy/jwt.strategy.ts`
- `src/auth/provider/jwt-token.provider.ts`

### DTO
- 모든 응답 DTO에서 `id` → `publicId` 변경

## 마이그레이션 전략

### 기존 데이터 처리
```sql
-- User 테이블에 publicId 컬럼 추가
ALTER TABLE "user" ADD COLUMN "publicId" UUID;
CREATE UNIQUE INDEX "IDX_user_publicId" ON "user"("publicId");

-- 기존 레코드에 UUID 생성
UPDATE "user" SET "publicId" = gen_random_uuid() WHERE "publicId" IS NULL;

-- NOT NULL 제약조건 추가
ALTER TABLE "user" ALTER COLUMN "publicId" SET NOT NULL;

-- SocialLogin 테이블도 동일하게 처리
```

## 보안 고려사항

1. **내부 ID 노출 방지**
   - 모든 API 응답에서 `id` 필드 제거
   - 로그에서도 `id` 대신 `publicId` 사용

2. **JWT 페이로드**
   - `sub` 필드에 `publicId` 사용
   - 기존 `id`는 제거

3. **데이터베이스 쿼리**
   - 외부 요청은 항상 `publicId`로 조회
   - 내부 로직은 `id` 사용 가능

4. **인덱싱**
   - `publicId`에 인덱스 추가하여 조회 성능 유지

## 롤백 계획

문제 발생 시:
1. 마이그레이션 롤백
2. DTO에서 `publicId` → `id` 복원
3. 서비스 메서드 복원

## 예상 소요 시간
- Phase 1-2: 2시간 (엔티티 수정, 마이그레이션)
- Phase 3-4: 3시간 (DTO, 서비스 수정)
- Phase 5-6: 2시간 (컨트롤러, JWT 수정)
- Phase 7-8: 2시간 (관계 엔티티, 테스트)
- **총 예상 시간: 9시간**

## 체크리스트

- [ ] UUID 패키지 설치
- [ ] User 엔티티에 publicId 추가
- [ ] SocialLogin 엔티티에 publicId 추가
- [ ] 마이그레이션 생성 및 실행
- [ ] 기존 데이터 publicId 생성
- [ ] AuthResult 인터페이스 수정
- [ ] AuthUserPayload 인터페이스 수정
- [ ] UserService에 findByPublicId 추가
- [ ] AuthService 수정 (JWT 페이로드)
- [ ] 모든 컨트롤러 수정
- [ ] JWT 전략 수정
- [ ] 모든 DTO 수정
- [ ] 테스트 작성 및 실행
- [ ] 문서 업데이트

