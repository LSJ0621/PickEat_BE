# 추천 이력 Pagination + 좌표 필드 제거

> 작성일: 2024-12  
> 목표: 추천 이력 조회 성능 개선 및 불필요한 필드 제거

---

## 📋 목차

1. [현황 분석](#-현황-분석)
2. [작업 목표](#-작업-목표)
3. [상세 작업 계획](#-상세-작업-계획)
4. [데이터베이스 마이그레이션](#-데이터베이스-마이그레이션)
5. [검증 계획](#-검증-계획)

---

## 📊 현황 분석

### 현재 문제점

| 문제 | 설명 | 영향 |
|------|------|------|
| Pagination 없음 | `GET /menu/recommendations/history`가 전체 배열 반환 | 데이터 많을 때 성능 저하 |
| 날짜 검색 기능 부재 | 특정 날짜의 추천 이력만 조회 불가 | 사용자 편의성 저하 |
| 불필요한 좌표 필드 | `requestLocationLat/Lng` 필드 사용 안 함 | 데이터 낭비 및 혼란 |

### 현재 구조

#### 엔티티 (`MenuRecommendation`)
```typescript
- requestAddress: string | null       // 프론트엔드에서 기본 주소를 포함하여 전송
- requestLocationLat: number | null  // 제거 예정
- requestLocationLng: number | null  // 제거 예정
```

#### 현재 엔드포인트
- `GET /menu/recommendations/history?date=YYYY-MM-DD`
  - Pagination 없음
  - 전체 `history` 배열 반환
  - 응답: `{ history: HistoryItem[] }`

#### 변경 후 엔드포인트
- `GET /menu/recommendations/history?page=1&limit=10&date=YYYY-MM-DD`
  - Pagination 지원 (페이지당 **최대 10개**)
  - 날짜 필터링 지원 (`date` 파라미터)
  - 응답: `{ items: HistoryItem[], pageInfo: { page, limit, totalCount, hasNext } }`

---

## 🎯 작업 목표

1. **Pagination 구현**: 페이지당 **최대 10개**씩만 조회 가능하도록 제한
2. **날짜 검색 기능**: `date` 쿼리 파라미터로 특정 날짜의 추천 이력만 조회 가능
3. **좌표 필드 제거**: `requestLocationLat/Lng` 필드 제거
4. **기본 주소 저장**: 서버에서 사용자 기본 주소를 조회하여 `requestAddress`에 저장

---

## 🔧 상세 작업 계획

### Phase 1: DTO 수정

#### 1-1. `RecommendMenuDto` 수정
**파일**: `src/menu/dto/recommend-menu.dto.ts`

**변경 사항**:
- [x] `requestLocation` 필드 제거
- [x] `requestAddress` 필드 제거 (서버에서 내부적으로 기본 주소 조회하여 저장)

**변경 후**:
```typescript
export class RecommendMenuDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;
}
```

**참고**: 프론트엔드에서 `requestAddress`를 보내지 않습니다. 서버에서 자동으로 사용자의 기본 주소를 조회하여 저장합니다.

#### 1-2. `RecommendationHistoryQueryDto` 수정
**파일**: `src/menu/dto/recommendation-history-query.dto.ts`

**변경 사항**:
- [x] `page` 파라미터 추가 (default: 1, 최소값: 1)
- [x] `limit` 파라미터 추가 (default: 10, **최소값: 0**, **최대값: 10** - 페이지당 최대 10개 제한)
- [x] `date` 파라미터 추가 (optional, YYYY-MM-DD 형식)

**변경 후**:
```typescript
export class RecommendationHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)   // 최소값: 0 (신규 유저는 이력이 없을 수 있음)
  @Max(10)  // 최대값: 10 (페이지당 최대 10개 제한)
  limit?: number = 10;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;  // 날짜 검색용 (예: 2024-12-01)
}
```

**사용 예시**:
- `GET /menu/recommendations/history` - 기본 조회 (1페이지, 10개)
- `GET /menu/recommendations/history?page=2` - 2페이지 조회 (10개)
- `GET /menu/recommendations/history?date=2024-12-01` - 특정 날짜 조회
- `GET /menu/recommendations/history?page=1&limit=10&date=2024-12-01` - 페이지 + 날짜 필터링

---

### Phase 2: 엔티티 수정

#### 2-1. `MenuRecommendation` 엔티티 수정
**파일**: `src/menu/entities/menu-recommendation.entity.ts`

**변경 사항**:
- [x] `requestLocationLat` 필드 제거
- [x] `requestLocationLng` 필드 제거
- [x] `requestAddress` 필드 유지 (서버에서 기본 주소를 조회하여 저장, **필수 필드**)

**변경 후**:
```typescript
@Column({ type: 'text', nullable: false })
requestAddress: string;  // 서버에서 사용자 기본 주소를 조회하여 저장 (필수)
```

---

### Phase 3: 기본 주소 조회 및 저장 로직 구현

#### 3-1. 기본 주소 조회 및 저장
**파일**: `src/menu/services/menu-recommendation.service.ts`

**의존성 추가**:
- `UserAddressService` 주입 필요
- `menu.module.ts`에서 `UserModule`이 이미 import되어 있고, `UserModule`에서 `UserAddressService`를 export하므로 주입 가능

**로직**:
1. `UserAddressService.getDefaultAddress()`로 사용자의 기본 주소 조회
2. 기본 주소가 없으면 `BadRequestException` 발생 (주소는 필수)
3. 조회한 주소의 `roadAddress`를 `requestAddress`에 저장

**구현**:
```typescript
// UserAddressService 주입 추가
constructor(
  @InjectRepository(MenuRecommendation)
  private readonly recommendationRepository: Repository<MenuRecommendation>,
  private readonly openAiMenuService: OpenAiMenuService,
  private readonly userAddressService: UserAddressService,  // 새로 추가
) {}

async recommend(
  entity: AuthenticatedEntity,
  prompt: string,
): Promise<RecommendationResponse> {
  const likes = entity.preferences?.likes ?? [];
  const dislikes = entity.preferences?.dislikes ?? [];
  const analysis = entity.preferences?.analysis;

  const recommendations =
    await this.openAiMenuService.generateMenuRecommendations(
      prompt,
      likes,
      dislikes,
      analysis,
    );

  // 기본 주소 조회 (필수)
  const defaultAddress = await this.userAddressService.getDefaultAddress(entity);
  if (!defaultAddress || !defaultAddress.roadAddress) {
    throw new BadRequestException('기본 주소를 설정해주세요.');
  }

  const record = this.recommendationRepository.create({
    ...(isUser(entity) ? { user: entity } : { socialLogin: entity }),
    prompt,
    recommendations,
    recommendedAt: new Date(),
    requestAddress: defaultAddress.roadAddress,  // 서버에서 조회한 기본 주소 저장 (필수)
  });

  await this.recommendationRepository.save(record);
  return this.buildRecommendationResponse(record);
}
```

---

### Phase 4: Pagination 로직 구현

#### 4-1. `MenuRecommendationService.getHistory()` 수정
**파일**: `src/menu/services/menu-recommendation.service.ts`

**변경 사항**:
- [x] `page`, `limit` 파라미터 추가
- [x] `skip`, `take` 사용하여 pagination 적용
- [x] `getManyAndCount()` 사용하여 총 개수 조회
- [x] `hasNext` 계산 로직 추가
- [x] 응답 구조 변경: `{ items, pageInfo }`

**변경 후 시그니처**:
```typescript
async getHistory(
  entity: AuthenticatedEntity,
  page: number = 1,
  limit: number = 10,
  date?: string,
): Promise<{
  items: HistoryItem[];
  pageInfo: {
    page: number;
    limit: number;
    totalCount: number;
    hasNext: boolean;
  };
}>
```

**구현**:
```typescript
const skip = (page - 1) * limit;
const [history, totalCount] = await qb
  .skip(skip)
  .take(limit)
  .getManyAndCount();

const hasNext = page * limit < totalCount;

return {
  items: history.map((item) => this.mapHistoryItem(item)),
  pageInfo: {
    page,
    limit,
    totalCount,
    hasNext,
  },
};
```

---

### Phase 5: 추천 생성 로직 수정

#### 5-1. `MenuRecommendationService.recommend()` 수정
**파일**: `src/menu/services/menu-recommendation.service.ts`

**변경 사항**:
- [x] `requestLocationLat/Lng` 파라미터 제거
- [x] `requestAddress` 파라미터 제거
- [x] `UserAddressService` 주입 추가
- [x] 기본 주소 조회 로직 추가
- [x] 조회한 주소를 `requestAddress`에 저장
- [x] 응답에 `requestAddress` 포함

**변경 후 시그니처**:
```typescript
async recommend(
  entity: AuthenticatedEntity,
  prompt: string,
): Promise<RecommendationResponse>
```

**구현**:
```typescript
// 기본 주소 조회 (필수)
const defaultAddress = await this.userAddressService.getDefaultAddress(entity);
if (!defaultAddress || !defaultAddress.roadAddress) {
  throw new BadRequestException('기본 주소를 설정해주세요.');
}

const record = this.recommendationRepository.create({
  ...(isUser(entity) ? { user: entity } : { socialLogin: entity }),
  prompt,
  recommendations,
  recommendedAt: new Date(),
  requestAddress: defaultAddress.roadAddress,  // 서버에서 조회한 기본 주소 저장 (필수)
});
```

---

### Phase 6: 응답 구조 수정

#### 6-1. History Item 응답 확인
**파일**: `src/menu/services/menu-recommendation.service.ts`

**확인 사항**:
- [x] `mapHistoryItem()` 메서드에서 `requestAddress`가 응답에 포함되는지 확인
- [x] 기존 응답 구조 유지 (변경 없음)

**현재 응답**:
```typescript
private mapHistoryItem(item: MenuRecommendation): HistoryItem {
  return {
    id: item.id,
    recommendations: item.recommendations,
    prompt: item.prompt,
    recommendedAt: item.recommendedAt,
    requestAddress: item.requestAddress,  // 기존 필드 유지
    hasPlaceRecommendations: (item.placeRecommendations?.length ?? 0) > 0,
  };
}
```

#### 6-2. 추천 생성 응답 확인
**파일**: `src/menu/services/menu-recommendation.service.ts`

**확인 사항**:
- [x] `buildRecommendationResponse()` 메서드에서 `requestAddress`가 응답에 포함되는지 확인
- [x] 기존 응답 구조 유지 (변경 없음)

**현재 응답**:
```typescript
private buildRecommendationResponse(record: MenuRecommendation) {
  return {
    id: record.id,
    recommendations: record.recommendations,
    recommendedAt: record.recommendedAt,
    requestAddress: record.requestAddress,  // 기존 필드 유지
  };
}
```

#### 6-3. 상세 조회 응답 확인
**파일**: `src/menu/services/place.service.ts`

**확인 사항**:
- [x] `buildRecommendationDetailResponse()` 메서드에서 `requestAddress`가 응답에 포함되는지 확인

---

### Phase 7: 컨트롤러 수정

#### 7-1. `MenuController.getHistory()` 수정
**파일**: `src/menu/menu.controller.ts`

**변경 사항**:
- [x] `page`, `limit` 파라미터 전달

**변경 후**:
```typescript
@Get('recommendations/history')
@UseGuards(JwtAuthGuard)
async getHistory(
  @Query() query: RecommendationHistoryQueryDto,
  @CurrentUser() authUser: AuthUserPayload,
) {
  const entity = await this.userService.getAuthenticatedEntity(authUser.email);
  return this.menuService.getHistory(
    entity,
    query.page ?? 1,
    query.limit ?? 10,
    query.date,
  );
}
```

#### 7-2. `MenuController.recommend()` 수정
**파일**: `src/menu/menu.controller.ts`

**변경 사항**:
- [x] `requestLocation` 파라미터 제거

**변경 후**:
```typescript
@Post('recommend')
@UseGuards(JwtAuthGuard)
async recommend(
  @Body() recommendMenuDto: RecommendMenuDto,
  @CurrentUser() authUser: AuthUserPayload,
) {
  const entity = await this.userService.getAuthenticatedEntity(authUser.email);
  return this.menuService.recommend(
    entity,
    recommendMenuDto.prompt,
  );
}
```

---

### Phase 8: 영향받는 코드 정리

#### 8-1. 좌표 필드 사용처 제거
**영향받는 파일**:
- [x] `src/menu/services/menu-recommendation.service.ts`
  - `recommend()` 메서드 시그니처 수정
- [x] `src/menu/menu.service.ts`
  - `recommend()` 메서드 시그니처 수정
- [x] `src/menu/menu.controller.ts`
  - `recommend()` 엔드포인트 수정
- [x] `src/menu/dto/recommend-menu.dto.ts`
  - `RecommendMenuLocationDto` 클래스 삭제
  - `requestLocation` 필드 제거

---

## 🗄️ 데이터베이스 마이그레이션

### 마이그레이션 파일 생성

**파일**: `src/migrations/XXXXXX-add-base-address-remove-location.ts`

**작업 내용**:
1. `requestLocationLat`, `requestLocationLng` 컬럼 삭제

**마이그레이션 SQL**:
```sql
-- 좌표 컬럼 삭제
ALTER TABLE "menu_recommendation" 
DROP COLUMN "requestLocationLat",
DROP COLUMN "requestLocationLng";
```

---

## ✅ 검증 계획

### 1. 추천 생성 검증
- [x] 기본 주소가 있는 경우 → `requestAddress`에 `roadAddress`가 저장되는지 확인
- [x] 기본 주소가 없는 경우 → `BadRequestException` 발생하는지 확인
- [x] 응답에 `requestAddress`가 포함되는지 확인
- [x] 프론트엔드에서 `requestAddress`를 보내지 않고 서버에서 자동으로 저장되는지 확인

### 2. Pagination 검증
- [x] `page=1, limit=10` → 첫 10개 반환되는지 확인
- [x] `page=2, limit=10` → 다음 10개 반환되는지 확인
- [x] `limit=0` → 빈 배열 반환되는지 확인 (신규 유저)
- [x] `limit` 최대값 10 초과 시 검증 에러 발생하는지 확인
- [x] `hasNext` 계산이 올바른지 확인
  - 총 25개, `page=2, limit=10` → `hasNext=true`
  - 총 20개, `page=2, limit=10` → `hasNext=false`
  - 총 0개 (신규 유저) → `hasNext=false`, `totalCount=0`
- [x] `date` 필터와 pagination이 함께 동작하는지 확인

### 3. 상세 조회 검증
- [x] `GET /menu/recommendations/:id` 응답에 `requestAddress` 포함되는지 확인
- [x] 좌표 필드가 응답에서 제거되었는지 확인

### 4. 하위 호환성 검증
- [x] 기존 API 호출이 정상 동작하는지 확인
- [x] `requestAddress` 필드는 유지되어 하위 호환성 보장

---

## 📋 완료 기준

- [x] Pagination이 정상 동작
- [x] `requestAddress`가 추천 생성 시 저장됨 (서버에서 기본 주소 조회하여 저장, 필수)
- [x] 기본 주소가 없으면 에러 발생
- [x] 모든 응답에 `requestAddress` 포함 (null이 아님)
- [x] 좌표 필드 완전 제거
- [x] 마이그레이션 적용 완료
- [x] 컴파일 성공
- [x] 기존 기능 정상 동작 확인

---

## 📝 참고 사항

### 주소 저장 방식

**서버 동작**:
1. 메뉴 추천 요청 시 `UserAddressService.getDefaultAddress()` 호출
2. 기본 주소가 없으면 `BadRequestException('기본 주소를 설정해주세요.')` 발생
3. 조회한 기본 주소의 `roadAddress`를 `requestAddress`에 저장 (필수)

**프론트엔드 동작**:
- `requestAddress`를 보내지 않음 (서버에서 자동 처리)
- **중요**: 사용자가 기본 주소를 설정하지 않으면 메뉴 추천 요청이 실패함

**주소 조회 우선순위**:
- `UserAddressService.getDefaultAddress()` → `isDefault=true`인 주소의 `roadAddress`
- 기본 주소가 없으면 에러 발생 (주소는 필수)

### Pagination 기본값 및 제한

- `page`: 기본값 1 (1부터 시작, 최소값: 1)
- `limit`: 기본값 10 (**최소값: 0**, **최대값: 10** - 페이지당 최대 10개 제한, 신규 유저는 이력이 없을 수 있음)
- `date`: optional, YYYY-MM-DD 형식 (예: `2024-12-01`)

### 응답 구조

**이력 조회 응답**:
```typescript
{
  items: [
    {
      id: number;
      recommendations: string[];
      prompt: string;
      recommendedAt: Date;
      requestAddress: string;  // 서버에서 조회한 기본 주소 (roadAddress, 필수)
      hasPlaceRecommendations: boolean;
    }
  ],
  pageInfo: {
    page: number;
    limit: number;
    totalCount: number;
    hasNext: boolean;
  }
}
```

**추천 생성 응답**:
```typescript
{
  id: number;
  recommendations: string[];
  recommendedAt: Date;
  requestAddress: string;  // 서버에서 조회한 기본 주소 (roadAddress, 필수)
}
```
