# Public ID vs Internal ID 사용 가이드

## 핵심 원칙

- **내부 (id)**: 데이터베이스 쿼리, 엔티티 관계, 서비스 내부 로직
- **외부 (publicId)**: API 응답, API 요청, URL 경로, 클라이언트 노출

---

## 1. 내부적으로 `id`를 쓰는 경우

### 1.1 데이터베이스 쿼리 (WHERE, JOIN)

```typescript
// ✅ 내부: id 사용
// src/menu/menu.service.ts
async updateSelectionForUser(
  user: User,
  selectionId: number,
  dto: UpdateMenuSelectionDto,
) {
  // 데이터베이스 쿼리에서는 항상 id 사용
  const selection = await this.menuSelectionRepository.findOne({
    where: { 
      id: selectionId, 
      user: { id: user.id }  // ← 내부 id 사용
    },
    relations: ['user'],
  });
  
  // ...
}
```

### 1.2 엔티티 관계 (Foreign Key)

```typescript
// ✅ 내부: id 사용
// src/menu/entities/menu-selection.entity.ts
@Entity()
export class MenuSelection {
  @PrimaryGeneratedColumn()
  id: number;  // ← 내부 id

  @ManyToOne(() => User, (user) => user.menuSelections)
  user: User;  // ← 관계는 내부 id로 연결

  // 데이터베이스에는 user.id가 Foreign Key로 저장됨
}
```

### 1.3 서비스 내부 로직

```typescript
// ✅ 내부: id 사용
// src/menu/menu.service.ts
async createSelectionForUser(
  user: User,
  menuPayload: MenuSlotPayload,
  historyId?: number,
) {
  // 같은 날짜의 레코드 찾기
  const existing = await this.menuSelectionRepository.findOne({
    where: {
      user: { id: user.id },  // ← 내부 id로 조회
      selectedDate,
    },
  });

  if (historyId !== undefined) {
    // 내부 id로 추천 이력 조회
    existing.menuRecommendation = await this.findOwnedRecommendationForUser(
      historyId,
      user.id,  // ← 내부 id 전달
    );
  }
}
```

### 1.4 JWT에서 사용자 조회

```typescript
// ✅ 내부: id 사용 (변경 전)
// src/auth/strategy/jwt.strategy.ts
validate(payload: AuthUserPayload): AuthUserPayload {
  // payload.sub는 내부 id (변경 후에는 publicId로 변경)
  // 하지만 내부 조회는 여전히 id 사용
  return payload;
}

// ✅ 내부: publicId로 조회하되, 내부 로직은 id 사용
// 변경 후 예시
async validate(payload: AuthUserPayload): Promise<User> {
  // JWT에는 publicId가 들어있음
  const publicId = payload.publicId;
  
  // publicId로 사용자 조회
  const user = await this.userService.findByPublicId(publicId);
  
  // 내부 로직에서는 user.id 사용
  return user;  // user.id는 내부에서만 사용
}
```

### 1.5 Repository 쿼리

```typescript
// ✅ 내부: id 사용
// src/menu/menu.service.ts
async getRecommendationHistory(user: User) {
  return this.recommendationRepository
    .createQueryBuilder('recommendation')
    .where('recommendation.userId = :userId', { 
      userId: user.id  // ← 내부 id 사용
    })
    .orderBy('recommendation.recommendedAt', 'DESC')
    .getMany();
}
```

---

## 2. 외부적으로 `publicId`를 쓰는 경우

### 2.1 API 응답 (DTO)

```typescript
// ✅ 외부: publicId 사용
// src/auth/auth.service.ts
export interface AuthResult {
  publicId: string;  // ← 외부 노출용 (변경 후)
  // id: number;     // ← 제거 (외부에 노출 안 함)
  token: string;
  refreshToken: string;
  email: string;
  // ...
}

// buildAuthResult 메서드
public async buildAuthResult(entity: AuthEntity): Promise<AuthResult> {
  const { token, refreshToken } = await this.issueTokens(entity);
  return {
    publicId: entity.publicId,  // ← 외부에 publicId 반환
    // id는 반환하지 않음
    token,
    refreshToken,
    email: entity.email,
    // ...
  };
}
```

### 2.2 API 요청 파라미터

```typescript
// ✅ 외부: publicId 사용
// src/user/user.controller.ts
@Get(':publicId')  // ← URL에 publicId 사용
@UseGuards(JwtAuthGuard)
async findOne(@Param('publicId') publicId: string) {
  // publicId로 조회
  return this.userService.findByPublicId(publicId);
}

@Patch(':publicId')
@UseGuards(JwtAuthGuard)
async update(
  @Param('publicId') publicId: string,
  @Body() updateUserDto: UpdateUserDto,
) {
  return this.userService.updateByPublicId(publicId, updateUserDto);
}
```

### 2.3 응답 DTO

```typescript
// ✅ 외부: publicId 사용
// src/menu/dto/menu-selection-response.dto.ts
export class MenuSelectionResponseDto {
  id: number;  // ← 내부 id (선택적, 필요시만)
  publicId: string;  // ← 외부 노출용 (추가)
  menuPayload: MenuSlotPayload;
  status: MenuSelectionStatus;
  // ...
}

// 또는 내부 id를 아예 제거
export class MenuSelectionResponseDto {
  publicId: string;  // ← 외부 노출용만
  menuPayload: MenuSlotPayload;
  status: MenuSelectionStatus;
  // id는 제거 (외부에 노출 안 함)
}
```

### 2.4 JWT 페이로드

```typescript
// ✅ 외부: publicId 사용
// src/auth/provider/jwt-token.provider.ts
createToken(email: string, publicId: string, role: string): string {
  const payload = { 
    email, 
    role,
    publicId,  // ← JWT에 publicId 포함
    // id는 포함하지 않음
  };
  return this.jwtService.sign(payload);
}

// src/auth/decorators/current-user.decorator.ts
export interface AuthUserPayload {
  email: string;
  role: string;
  publicId: string;  // ← publicId 사용
  // sub?: number;    // ← 제거 또는 내부용으로만 사용
}
```

---

## 3. 변환 로직 (publicId ↔ id)

### 3.1 UserService에 변환 메서드 추가

```typescript
// src/user/user.service.ts
@Injectable()
export class UserService {
  // ✅ 외부: publicId로 조회
  async findByPublicId(publicId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { publicId },
    });

    if (!user) {
      throw new NotFoundException(`User with publicId ${publicId} not found`);
    }

    return user;
  }

  // ✅ 내부: id로 조회 (기존 메서드 유지)
  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  // ✅ 외부: publicId로 업데이트
  async updateByPublicId(
    publicId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    const user = await this.findByPublicId(publicId);  // publicId로 조회
    // 내부 로직은 user.id 사용
    return this.update(user.id, updateUserDto);  // 내부 id로 업데이트
  }

  // ✅ 내부: id로 업데이트 (기존 메서드 유지)
  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    // ... 업데이트 로직
    return this.userRepository.save(user);
  }
}
```

### 3.2 Controller에서 변환

```typescript
// src/user/user.controller.ts
@Controller('user')
export class UserController {
  // ✅ 외부: publicId 사용
  @Get(':publicId')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('publicId') publicId: string) {
    // publicId로 조회 (내부적으로는 id 사용)
    return this.userService.findByPublicId(publicId);
  }

  // ✅ 내부: JWT에서 받은 user는 이미 내부 id로 조회됨
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: User) {
    // user.id는 내부용
    // 응답에는 publicId 포함
    return {
      publicId: user.publicId,
      email: user.email,
      // id는 반환하지 않음
    };
  }
}
```

---

## 4. 실제 사용 예시

### 4.1 메뉴 선택 생성 (내부 id 사용)

```typescript
// src/menu/menu.controller.ts
@Post('selection')
@UseGuards(JwtAuthGuard)
async createSelection(
  @CurrentUser() user: User,  // JWT에서 받은 user (내부 id 포함)
  @Body() dto: CreateMenuSelectionDto,
) {
  // user.id는 내부용으로 사용
  return this.menuService.createSelectionForUser(
    user,  // ← user.id가 내부적으로 사용됨
    dto.menuPayload,
  );
}

// src/menu/menu.service.ts
async createSelectionForUser(
  user: User,  // user.id 사용 (내부)
  menuPayload: MenuSlotPayload,
) {
  // ✅ 내부: user.id로 조회
  const existing = await this.menuSelectionRepository.findOne({
    where: {
      user: { id: user.id },  // ← 내부 id
      selectedDate,
    },
  });

  // 응답에는 publicId 포함
  const selection = await this.menuSelectionRepository.save(newSelection);
  
  return {
    publicId: selection.publicId,  // ← 외부 노출
    menuPayload: selection.menuPayload,
    // id는 반환하지 않음
  };
}
```

### 4.2 메뉴 선택 조회 (외부 publicId 사용)

```typescript
// src/menu/menu.controller.ts
@Get('selection/:publicId')
@UseGuards(JwtAuthGuard)
async getSelection(
  @CurrentUser() user: User,
  @Param('publicId') selectionPublicId: string,  // ← 외부 publicId
) {
  // publicId로 조회하되, 내부적으로는 id 사용
  return this.menuService.findSelectionByPublicId(
    user.publicId,  // ← 사용자도 publicId로 전달
    selectionPublicId,
  );
}

// src/menu/menu.service.ts
async findSelectionByPublicId(
  userPublicId: string,  // ← 외부 publicId
  selectionPublicId: string,
) {
  // 1. publicId로 사용자 조회 (내부 id 얻기)
  const user = await this.userService.findByPublicId(userPublicId);
  
  // 2. 내부 id로 메뉴 선택 조회
  const selection = await this.menuSelectionRepository.findOne({
    where: {
      publicId: selectionPublicId,
      user: { id: user.id },  // ← 내부 id 사용
    },
  });

  // 3. 응답에는 publicId 반환
  return {
    publicId: selection.publicId,
    menuPayload: selection.menuPayload,
    // id는 반환하지 않음
  };
}
```

---

## 5. 체크리스트

### ✅ 내부 (id 사용)
- [ ] 데이터베이스 쿼리 (WHERE, JOIN)
- [ ] 엔티티 관계 (Foreign Key)
- [ ] Repository 메서드
- [ ] 서비스 내부 로직
- [ ] TypeORM 쿼리 빌더

### ✅ 외부 (publicId 사용)
- [ ] API 응답 (DTO)
- [ ] API 요청 파라미터
- [ ] URL 경로
- [ ] JWT 페이로드
- [ ] 클라이언트에 노출되는 모든 데이터

---

## 6. 주의사항

### ❌ 하지 말아야 할 것

```typescript
// ❌ 외부에 id 노출
@Get(':id')
async findOne(@Param('id') id: string) {
  return this.userService.findOne(+id);  // id를 외부에 노출
}

// ❌ 응답에 id 포함
return {
  id: user.id,  // 외부에 노출하면 안 됨
  email: user.email,
};

// ❌ JWT에 id 포함
const payload = {
  id: user.id,  // 외부에 노출하면 안 됨
  email: user.email,
};
```

### ✅ 올바른 방법

```typescript
// ✅ 외부에 publicId 사용
@Get(':publicId')
async findOne(@Param('publicId') publicId: string) {
  return this.userService.findByPublicId(publicId);
}

// ✅ 응답에 publicId 포함
return {
  publicId: user.publicId,  // 외부 노출용
  email: user.email,
  // id는 제외
};

// ✅ JWT에 publicId 포함
const payload = {
  publicId: user.publicId,  // 외부 노출용
  email: user.email,
  // id는 제외
};
```

---

## 요약

| 구분 | 사용 위치 | 사용 값 |
|------|----------|--------|
| **내부** | DB 쿼리, 엔티티 관계, 서비스 로직 | `id` (number) |
| **외부** | API 응답, 요청 파라미터, JWT | `publicId` (string) |

**핵심**: 
- 내부에서는 항상 `id` 사용 (데이터베이스 효율성)
- 외부에서는 항상 `publicId` 사용 (보안)
- 변환은 서비스 레이어에서 처리

