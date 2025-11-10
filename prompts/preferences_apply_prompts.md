# 취향 정보를 메뉴 추천 요청에 포함시키는 방법

## 요구사항
프론트엔드에서 메뉴 추천 API를 호출할 때, 취향 정보(tags)를 요청 Body에 포함시켜서 보낼 수 있도록 구현해야 합니다.

## 현재 상태
- 메뉴 추천 API: `POST /menu/recommend`
- 현재 DTO: `RecommendMenuDto`에는 `prompt` 필드만 있음
- 서버는 JWT 토큰에서 사용자 정보를 추출하여 DB에서 취향 정보를 자동으로 조회

## 구현 방법

### 1. DTO 수정
`src/menu/dto/recommend-menu.dto.ts` 파일을 수정하여 `tags` 필드를 추가합니다.

```typescript
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RecommendMenuDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
```

### 2. Controller 수정
`src/menu/menu.controller.ts` 파일을 수정하여 요청에서 받은 `tags`를 서비스에 전달합니다.

```typescript
@Post('recommend')
async recommend(
  @Body() recommendMenuDto: RecommendMenuDto,
  @CurrentUser() authUser: AuthUserPayload,
) {
  const user = await this.userService.getOrFailByEmail(authUser.email);
  // 요청에서 받은 tags를 전달 (없으면 서비스에서 DB에서 가져옴)
  return this.menuService.recommendForUser(
    user, 
    recommendMenuDto.prompt,
    recommendMenuDto.tags, // 추가
  );
}
```

### 3. Service 수정
`src/menu/menu.service.ts` 파일을 수정하여 요청에서 받은 `tags`를 우선 사용하고, 없으면 DB에서 가져오도록 합니다.

```typescript
async recommendForUser(
  user: User, 
  prompt: string,
  tagsFromRequest?: string[], // 추가
): Promise<{ recommendations: string[]; recommendedAt: Date }> {
  // 요청에서 받은 tags를 우선 사용, 없으면 DB에서 가져오기
  const tags = tagsFromRequest ?? user.preferences?.tags ?? [];
  
  const recommendations =
    await this.openAiMenuService.generateMenuRecommendations(prompt, tags);
  
  const record = this.recommendationRepository.create({
    user,
    prompt,
    recommendations,
    recommendedAt: new Date(),
  });
  await this.recommendationRepository.save(record);
  
  return {
    recommendations: record.recommendations,
    recommendedAt: record.recommendedAt,
  };
}
```

### 4. 프론트엔드 사용 방법

#### 4.1 취향 정보 포함하여 요청 보내기
```typescript
async function recommendMenu(
  jwtToken: string, 
  prompt: string, 
  tags?: string[] // 취향 정보 (선택사항)
) {
  const body: { prompt: string; tags?: string[] } = { prompt };
  
  // 취향 정보가 있으면 포함
  if (tags && tags.length > 0) {
    body.tags = tags;
  }
  
  const response = await fetch(`${API_BASE_URL}/menu/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    },
    body: JSON.stringify(body),
  });
  
  return await response.json();
}
```

#### 4.2 사용 예시
```typescript
// 취향 정보와 함께 요청
const result = await recommendMenu(
  jwtToken,
  '오늘 기분이 안좋은데 메뉴 추천해줘',
  ['매운 음식 선호', '한식 선호'] // 취향 정보 포함
);

// 취향 정보 없이 요청 (기존처럼 DB에서 가져옴)
const result2 = await recommendMenu(
  jwtToken,
  '오늘 날씨가 더운데 뭐 먹을까?'
  // tags 생략 시 DB에서 자동으로 가져옴
);
```

### 5. 요청 Body 형식

#### 5.1 취향 정보 포함
```json
{
  "prompt": "오늘 기분이 안좋은데 메뉴 추천해줘",
  "tags": [
    "매운 음식 선호",
    "한식 선호",
    "같은 메뉴 반복 싫어함"
  ]
}
```

#### 5.2 취향 정보 없이 (기존 방식)
```json
{
  "prompt": "오늘 날씨가 더운데 뭐 먹을까?"
}
```

### 6. 동작 방식
1. 프론트엔드에서 `tags`를 포함하여 요청 → 서버는 요청의 `tags` 사용
2. 프론트엔드에서 `tags`를 포함하지 않음 → 서버는 DB에서 사용자의 취향 정보 조회
3. DB에도 취향 정보가 없음 → `tags`는 빈 배열로 처리

### 7. 장점
- 프론트엔드에서 실시간으로 취향 정보를 변경하여 테스트 가능
- 특정 요청에만 다른 취향 정보를 적용할 수 있음
- 기존 동작 방식(DB에서 자동 조회)도 유지됨
