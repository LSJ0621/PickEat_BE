import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SearchRestaurantBlogsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query: string; // 주소 + 가게이름 (전체 검색어)

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  restaurantName: string; // 가게이름만

  @IsOptional()
  @IsString()
  @IsIn(['ko', 'en'])
  language?: 'ko' | 'en'; // 언어 코드 (ko, en)

  @IsOptional()
  @IsString()
  @MaxLength(255)
  searchName?: string; // 검색용 현지 언어 가게명

  @IsOptional()
  @IsString()
  @MaxLength(500)
  searchAddress?: string; // 검색용 현지 언어 주소
}
