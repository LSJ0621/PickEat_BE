import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsS3PhotoUrl } from '@/common/validators/s3-url.validator';

export class CreateUserPlaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsLatitude()
  @IsNotEmpty()
  latitude: number;

  @IsLongitude()
  @IsNotEmpty()
  longitude: number;

  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayMinSize(1, { message: '메뉴를 최소 1개 이상 입력해주세요' })
  @ArrayMaxSize(10, { message: '메뉴는 최대 10개까지 입력 가능합니다' })
  @IsString({ each: true })
  menuTypes: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '사진은 최대 5장까지 업로드 가능합니다' })
  @IsUrl({}, { each: true, message: '유효한 URL 형식이어야 합니다' })
  @IsS3PhotoUrl({ each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '영업시간은 200자 이내로 입력해주세요' })
  openingHours?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: '설명은 1000자 이내로 입력해주세요' })
  description?: string;
}
