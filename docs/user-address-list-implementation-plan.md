# 유저 주소 리스트 기능 구현 계획

## 📋 현재 상태

### 현재 구조
- `User` 엔티티: 단일 주소 필드 (`address`, `latitude`, `longitude`)
- `SocialLogin` 엔티티: 단일 주소 필드 (`address`, `latitude`, `longitude`)
- 주소 검색 API: `GET /user/address/search` (카카오 API 사용)
- 주소 업데이트 API: `PATCH /user/address` (단일 주소만 업데이트)
- User, SocialLogin 모두 soft delete 사용 중 (`@DeleteDateColumn`)

### 카카오 API 응답 구조
- `road_address.address_name`: 도로명 주소 (있을 수도, 없을 수도)
- `road_address.zone_no`: 우편번호 (도로명 주소가 있을 때만)
- `y`: 위도
- `x`: 경도
- `address.address_name`: 지번 주소 (현재는 사용하지만, 저장 시 도로명 주소 우선)

### 문제점
- 하나의 주소만 저장 가능
- 주소 추가/삭제 불가능
- 여러 주소 관리 불가능

---

## 🎯 목표

1. 유저가 최대 4개의 주소를 저장할 수 있도록 변경
2. 주소 추가, 수정, 삭제 기능 구현 (soft delete 사용)
3. 기본 주소 설정 기능 추가 (마이페이지 표시용)
4. **검색 주소 설정 기능 추가** (메뉴 추천/검색 시 사용할 주소)
5. 주소 요소별 개별 수정 가능 (도로명 주소, 위도, 경도, 별칭 등)
6. 기존 단일 주소 데이터 마이그레이션

---

## 📐 데이터베이스 설계

### 1. UserAddress 엔티티 생성

```typescript
// src/user/entities/user-address.entity.ts

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SocialLogin } from './social-login.entity';
import { User } from './user.entity';

@Entity('user_address')
export class UserAddress {
  @PrimaryGeneratedColumn()
  id: number;

  // User 또는 SocialLogin 중 하나만 참조
  @ManyToOne(() => User, (user) => user.addresses, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  user: User | null;

  @ManyToOne(() => SocialLogin, (socialLogin) => socialLogin.addresses, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  socialLogin: SocialLogin | null;

  @Column()
  roadAddress: string; // 도로명 주소 (카카오 API에서 받아옴)

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number; // 위도 (카카오 API에서 받아옴)

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number; // 경도 (카카오 API에서 받아옴)

  @Column({ default: false })
  isDefault: boolean; // 기본 주소 여부 (마이페이지 표시용)

  @Column({ default: false })
  isSearchAddress: boolean; // 검색 주소 여부 (메뉴 추천/검색 시 사용)

  @Column({ nullable: true })
  alias: string | null; // 주소 별칭 (예: "집", "회사") - Nullable

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null; // Soft delete

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 2. User 엔티티 수정

```typescript
// src/user/entities/user.entity.ts

@Entity()
export class User {
  // ... 기존 필드들 ...

  // 기존 단일 주소 필드 (deprecated, 마이그레이션 후 제거 예정)
  @Column({ nullable: true })
  address: string; // ⚠️ deprecated

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null; // ⚠️ deprecated

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null; // ⚠️ deprecated

  // 새로운 주소 리스트 관계
  @OneToMany(() => UserAddress, (address) => address.user, {
    cascade: true,
  })
  addresses: UserAddress[];

  // ... 나머지 필드들 ...
}
```

### 3. SocialLogin 엔티티 수정

```typescript
// src/user/entities/social-login.entity.ts

@Entity('social_login')
export class SocialLogin {
  // ... 기존 필드들 ...

  // 기존 단일 주소 필드 (deprecated, 마이그레이션 후 제거 예정)
  @Column({ nullable: true })
  address: string; // ⚠️ deprecated

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null; // ⚠️ deprecated

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null; // ⚠️ deprecated

  // 새로운 주소 리스트 관계
  @OneToMany(() => UserAddress, (address) => address.socialLogin, {
    cascade: true,
  })
  addresses: UserAddress[];

  // ... 나머지 필드들 ...
}
```

---

## 🔧 구현 단계

### Phase 1: 엔티티 및 관계 설정

1. **UserAddress 엔티티 생성**
   - `src/user/entities/user-address.entity.ts` 생성
   - User와 SocialLogin 모두 참조 가능하도록 설계
   - `isDefault` 필드로 기본 주소 관리 (마이페이지 표시용)
   - `isSearchAddress` 필드로 검색 주소 관리 (메뉴 추천/검색 시 사용)
   - `alias` 필드는 Nullable
   - `@DeleteDateColumn`으로 soft delete 구현
   - 도로명 주소, 위도, 경도만 저장 (카카오 API 기준)

2. **User 엔티티 수정**
   - `@OneToMany` 관계 추가
   - 기존 주소 필드는 유지 (마이그레이션용)

3. **SocialLogin 엔티티 수정**
   - `@OneToMany` 관계 추가
   - 기존 주소 필드는 유지 (마이그레이션용)

4. **UserModule에 UserAddress 엔티티 등록**
   - `TypeOrmModule.forFeature([UserAddress])` 추가

---

### Phase 2: DTO 생성

1. **CreateUserAddressDto**
   ```typescript
   export class CreateUserAddressDto {
     @IsString()
     @IsNotEmpty()
     roadAddress: string; // 도로명 주소

     @IsNumber()
     @IsNotEmpty()
     latitude: number; // 위도

     @IsNumber()
     @IsNotEmpty()
     longitude: number; // 경도

     @IsString()
     @IsOptional()
     alias?: string | null; // 주소 별칭 (선택사항, Nullable)

     @IsBoolean()
     @IsOptional()
     isDefault?: boolean; // 기본 주소로 설정할지 여부

     @IsBoolean()
     @IsOptional()
     isSearchAddress?: boolean; // 검색 주소로 설정할지 여부
   }
   ```

2. **UpdateUserAddressDto** (부분 수정 가능)
   ```typescript
   export class UpdateUserAddressDto {
     @IsString()
     @IsOptional()
     roadAddress?: string; // 도로명 주소 (선택적 수정)

     @IsNumber()
     @IsOptional()
     latitude?: number; // 위도 (선택적 수정)

     @IsNumber()
     @IsOptional()
     longitude?: number; // 경도 (선택적 수정)

     @IsString()
     @IsOptional()
     alias?: string | null; // 주소 별칭 (선택적 수정, Nullable)

     @IsBoolean()
     @IsOptional()
     isDefault?: boolean; // 기본 주소 설정 여부

     @IsBoolean()
     @IsOptional()
     isSearchAddress?: boolean; // 검색 주소 설정 여부
   }
   ```

3. **UserAddressResponseDto**
   ```typescript
   export class UserAddressResponseDto {
     id: number;
     roadAddress: string;
     latitude: number;
     longitude: number;
     isDefault: boolean; // 기본 주소 (마이페이지 표시용)
     isSearchAddress: boolean; // 검색 주소 (메뉴 추천/검색 시 사용)
     alias: string | null; // 주소 별칭 (Nullable)
     createdAt: Date;
     updatedAt: Date;
   }
   ```

---

### Phase 3: 서비스 레이어 구현

1. **UserService에 주소 관련 메서드 추가**
   ```typescript
   // 주소 리스트 조회 (soft delete 제외)
   async getUserAddresses(userId: number): Promise<UserAddress[]>
   async getSocialLoginAddresses(socialLoginId: number): Promise<UserAddress[]>

   // 주소 추가 (최대 4개 제한)
   async createUserAddress(userId: number, dto: CreateUserAddressDto): Promise<UserAddress>
   async createSocialLoginAddress(socialLoginId: number, dto: CreateUserAddressDto): Promise<UserAddress>

   // 주소 수정 (부분 수정 가능)
   async updateUserAddress(addressId: number, userId: number, dto: UpdateUserAddressDto): Promise<UserAddress>
   async updateSocialLoginAddress(addressId: number, socialLoginId: number, dto: UpdateUserAddressDto): Promise<UserAddress>

   // 주소 삭제 (soft delete)
   async deleteUserAddress(addressId: number, userId: number): Promise<void>
   async deleteSocialLoginAddress(addressId: number, socialLoginId: number): Promise<void>

   // 기본 주소 설정 (마이페이지 표시용)
   async setDefaultUserAddress(addressId: number, userId: number): Promise<UserAddress>
   async setDefaultSocialLoginAddress(addressId: number, socialLoginId: number): Promise<UserAddress>

   // 검색 주소 설정 (메뉴 추천/검색 시 사용)
   async setSearchUserAddress(addressId: number, userId: number): Promise<UserAddress>
   async setSearchSocialLoginAddress(addressId: number, socialLoginId: number): Promise<UserAddress>

   // 기본 주소 조회
   async getDefaultUserAddress(userId: number): Promise<UserAddress | null>
   async getDefaultSocialLoginAddress(socialLoginId: number): Promise<UserAddress | null>

   // 검색 주소 조회
   async getSearchUserAddress(userId: number): Promise<UserAddress | null>
   async getSearchSocialLoginAddress(socialLoginId: number): Promise<UserAddress | null>
   ```

2. **주요 로직**
   - **최대 4개 제한**: 주소 추가 시 현재 활성 주소 개수 확인 (soft delete 제외)
   - **기본 주소 설정**: 설정 시 기존 기본 주소 해제
   - **검색 주소 설정**: 설정 시 기존 검색 주소 해제
   - **주소 추가 시**: 첫 번째 주소면 자동으로 기본 주소 및 검색 주소로 설정
   - **기본 주소 삭제 시**: 다른 주소를 기본으로 설정 (있는 경우)
   - **검색 주소 삭제 시**: 다른 주소를 검색 주소로 설정 (있는 경우)
   - **Soft delete**: `@DeleteDateColumn` 사용, 실제 삭제는 하지 않음

---

### Phase 4: 컨트롤러 구현

1. **UserController에 엔드포인트 추가**
   ```typescript
   // 기본 주소 조회 (마이페이지 표시용)
   @Get('address/default')
   @UseGuards(JwtAuthGuard)
   async getDefaultAddress(@CurrentUser() authUser: AuthUserPayload)

   // 주소 리스트 조회 (soft delete 제외)
   @Get('addresses')
   @UseGuards(JwtAuthGuard)
   async getUserAddresses(@CurrentUser() authUser: AuthUserPayload)

   // 주소 추가 (최대 4개 제한)
   @Post('addresses')
   @UseGuards(JwtAuthGuard)
   async createUserAddress(@Body() dto: CreateUserAddressDto, @CurrentUser() authUser: AuthUserPayload)

   // 주소 수정 (부분 수정 가능)
   @Patch('addresses/:id')
   @UseGuards(JwtAuthGuard)
   async updateUserAddress(@Param('id') id: string, @Body() dto: UpdateUserAddressDto, @CurrentUser() authUser: AuthUserPayload)

   // 주소 삭제 (soft delete)
   @Delete('addresses/:id')
   @UseGuards(JwtAuthGuard)
   async deleteUserAddress(@Param('id') id: string, @CurrentUser() authUser: AuthUserPayload)

   // 기본 주소 설정 (마이페이지 표시용)
   @Patch('addresses/:id/default')
   @UseGuards(JwtAuthGuard)
   async setDefaultAddress(@Param('id') id: string, @CurrentUser() authUser: AuthUserPayload)

   // 검색 주소 설정 (메뉴 추천/검색 시 사용)
   @Patch('addresses/:id/search')
   @UseGuards(JwtAuthGuard)
   async setSearchAddress(@Param('id') id: string, @CurrentUser() authUser: AuthUserPayload)
   ```

---

### Phase 5: 기존 코드 마이그레이션

1. **기존 단일 주소를 UserAddress로 마이그레이션**
   - 스크립트 작성: `scripts/migrate-single-address-to-list.ts`
   - User와 SocialLogin의 기존 주소를 UserAddress로 변환
   - 기존 주소가 있으면 `isDefault: true`, `isSearchAddress: true`로 설정

2. **기존 API 호환성 유지 (선택사항)**
   - `PATCH /user/address`는 기본 주소를 업데이트하도록 변경
   - 또는 deprecated 처리하고 새 API 사용 권장

---

### Phase 6: MenuService 수정

1. **메뉴 추천 API에서 검색 주소 자동 사용**
   - `recommendForUser()`: `requestAddress`가 없으면 검색 주소 자동 사용
   - `recommendForSocialLogin()`: `requestAddress`가 없으면 검색 주소 자동 사용
   - 검색 주소가 없으면 기본 주소 사용
   - 둘 다 없으면 `requestAddress`를 null로 처리

---

### Phase 7: AuthService 수정

1. **AuthResult와 AuthProfile 인터페이스 수정**
   - 기존 `address`, `latitude`, `longitude` 필드는 기본 주소 정보로 사용
   - 또는 제거하고 프론트엔드에서 주소 리스트 API 호출하도록 변경

---

## 📊 데이터베이스 스키마

### PostgreSQL 테이블 구조

```sql
CREATE TABLE user_address (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    "socialLoginId" INTEGER REFERENCES social_login(id) ON DELETE CASCADE,
    "roadAddress" VARCHAR NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    "isDefault" BOOLEAN DEFAULT false,
    "isSearchAddress" BOOLEAN DEFAULT false,
    alias VARCHAR,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_user_or_social_login CHECK (
        ("userId" IS NOT NULL AND "socialLoginId" IS NULL) OR
        ("userId" IS NULL AND "socialLoginId" IS NOT NULL)
    )
);

CREATE INDEX idx_user_address_user_id ON user_address("userId") WHERE "deletedAt" IS NULL;
CREATE INDEX idx_user_address_social_login_id ON user_address("socialLoginId") WHERE "deletedAt" IS NULL;
CREATE INDEX idx_user_address_is_default ON user_address("isDefault") WHERE "deletedAt" IS NULL;
CREATE INDEX idx_user_address_is_search_address ON user_address("isSearchAddress") WHERE "deletedAt" IS NULL;
```

---

## 🔄 API 엔드포인트

### 1. 기본 주소 조회 (마이페이지 표시용)
- **GET** `/user/address/default`
- **인증**: JWT 토큰 필요
- **응답**: `UserAddressResponseDto | null`
- **설명**: 마이페이지에 표시할 현재 기본 주소 조회

### 2. 주소 리스트 조회
- **GET** `/user/addresses`
- **인증**: JWT 토큰 필요
- **응답**: `UserAddressResponseDto[]`
- **설명**: soft delete되지 않은 주소 리스트 반환 (최대 4개)

### 3. 주소 추가
- **POST** `/user/addresses`
- **인증**: JWT 토큰 필요
- **Body**: `CreateUserAddressDto`
- **응답**: `UserAddressResponseDto`
- **제한**: 최대 4개까지만 저장 가능 (초과 시 에러 반환)

### 4. 주소 수정 (부분 수정 가능)
- **PATCH** `/user/addresses/:id`
- **인증**: JWT 토큰 필요
- **Body**: `UpdateUserAddressDto` (모든 필드 선택적)
- **응답**: `UserAddressResponseDto`
- **설명**: 도로명 주소, 위도, 경도, 별칭 등 특정 요소만 수정 가능

### 5. 주소 삭제 (soft delete)
- **DELETE** `/user/addresses/:id`
- **인증**: JWT 토큰 필요
- **응답**: `{ message: "주소가 삭제되었습니다." }`
- **설명**: `deletedAt` 필드에 현재 시간 설정 (실제 삭제 아님)

### 6. 기본 주소 설정 (마이페이지 표시용)
- **PATCH** `/user/addresses/:id/default`
- **인증**: JWT 토큰 필요
- **응답**: `UserAddressResponseDto`
- **설명**: 주소 리스트에서 선택하여 기본 주소로 설정 (마이페이지 표시용)

### 7. 검색 주소 설정 (메뉴 추천/검색 시 사용)
- **PATCH** `/user/addresses/:id/search`
- **인증**: JWT 토큰 필요
- **응답**: `UserAddressResponseDto`
- **설명**: 주소 리스트에서 선택하여 메뉴 추천/검색 시 사용할 주소로 설정

---

## 📱 사용자 플로우

### 마이페이지 주소 관리 플로우

1. **마이페이지 진입**
   - `GET /user/address/default` 호출
   - 현재 설정된 기본 주소 표시

2. **주소 변경하기 클릭**
   - `GET /user/addresses` 호출
   - 주소 리스트 표시 (최대 4개)

3. **주소 리스트에서 선택**
   - 사용자가 원하는 주소 선택
   - `PATCH /user/addresses/:id/default` 호출
   - 선택한 주소를 기본 주소로 설정

4. **주소 추가**
   - 카카오 주소 검색 API 호출
   - 검색 결과에서 주소 선택
   - `POST /user/addresses` 호출하여 추가
   - 최대 4개 제한 확인

5. **주소 수정**
   - 주소 리스트에서 수정할 주소 선택
   - `PATCH /user/addresses/:id` 호출
   - 도로명 주소, 위도, 경도, 별칭 등 특정 요소만 수정 가능

6. **주소 삭제**
   - 주소 리스트에서 삭제할 주소 선택
   - `DELETE /user/addresses/:id` 호출
   - Soft delete 처리 (실제 삭제 아님)

---

## ⚠️ 주의사항

1. **제약조건**
   - User 또는 SocialLogin 중 하나만 참조해야 함 (CHECK 제약조건)
   - 기본 주소는 한 개만 존재해야 함 (애플리케이션 레벨에서 관리)
   - 검색 주소는 한 개만 존재해야 함 (애플리케이션 레벨에서 관리)
   - 기본 주소와 검색 주소는 서로 독립적 (같은 주소일 수도, 다를 수도 있음)
   - 최대 4개까지만 저장 가능 (soft delete 제외)

2. **Soft Delete**
   - `@DeleteDateColumn` 사용
   - 삭제된 주소는 조회되지 않음 (`deletedAt IS NULL` 조건)
   - 인덱스에 `WHERE deletedAt IS NULL` 조건 추가하여 성능 최적화

3. **카카오 API 데이터**
   - 도로명 주소(`roadAddress`), 위도(`latitude`), 경도(`longitude`)만 저장
   - 지번 주소는 저장하지 않음 (도로명 주소 우선)

4. **부분 수정**
   - `UpdateUserAddressDto`의 모든 필드는 선택적
   - 전달된 필드만 업데이트 (undefined 필드는 무시)

5. **마이그레이션**
   - 기존 단일 주소 데이터를 UserAddress로 변환
   - 기존 API와의 호환성 고려

6. **성능**
   - 주소 리스트 조회 시 인덱스 활용
   - 기본 주소/검색 주소 조회 최적화
   - Soft delete 쿼리 최적화 (`WHERE deletedAt IS NULL`)

7. **보안**
   - 모든 엔드포인트에 JWT 인증 필수
   - 본인의 주소만 조회/수정/삭제 가능하도록 검증

---

## 📝 구현 순서

1. ✅ UserAddress 엔티티 생성 (soft delete 포함)
2. ✅ User, SocialLogin 엔티티에 관계 추가
3. ✅ DTO 생성 (부분 수정 가능하도록)
4. ✅ UserService 메서드 구현 (최대 4개 제한, soft delete)
5. ✅ UserController 엔드포인트 추가
6. ✅ 마이그레이션 스크립트 작성 및 실행
7. ✅ MenuService에서 검색 주소 자동 사용 로직 추가
8. ✅ 기존 API 호환성 처리
9. ✅ 테스트

---

## 🎯 예상 결과

- 유저가 최대 4개의 주소를 저장하고 관리할 수 있음
- 기본 주소 설정으로 마이페이지에 표시 가능
- 검색 주소 설정으로 메뉴 추천/검색 시 자동으로 사용할 주소 지정 가능
- 주소 리스트에서 선택하여 기본 주소 변경 가능
- 주소 요소별 개별 수정 가능 (도로명 주소, 위도, 경도, 별칭 등)
- Soft delete로 주소 삭제 (실제 삭제 아님)
- 주소 별칭으로 사용자 편의성 향상 (Nullable)
- 기존 단일 주소 데이터는 자동으로 마이그레이션됨
- 메뉴 추천 API에서 주소를 전달하지 않으면 검색 주소 자동 사용
