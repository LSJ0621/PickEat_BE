import { IsNotEmpty, IsString } from 'class-validator';

export class SearchRestaurantBlogsDto {
  @IsString()
  @IsNotEmpty()
  query: string; // 주소 + 가게이름 (전체 검색어)

  @IsString()
  @IsNotEmpty()
  restaurantName: string; // 가게이름만
}

