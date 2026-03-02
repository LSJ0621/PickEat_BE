import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsLatitude,
  IsLongitude,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { IsS3PhotoUrl } from '@/common/validators/s3-url.validator';
import { MenuItemDto, BusinessHoursDto } from './create-user-place.dto';

export class UpdateUserPlaceDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  version: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @Transform(({ value }) => {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed)
        ? plainToInstance(MenuItemDto, parsed)
        : parsed;
    } catch {
      return value;
    }
  })
  @IsArray()
  @ArrayMinSize(1, { message: '메뉴를 최소 1개 이상 입력해주세요' })
  @ArrayMaxSize(10, { message: '메뉴는 최대 10개까지 입력 가능합니다' })
  @ValidateNested({ each: true })
  menuItems?: MenuItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '사진은 최대 5장까지 업로드 가능합니다' })
  @IsUrl({}, { each: true, message: '유효한 URL 형식이어야 합니다' })
  @IsS3PhotoUrl({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  existingPhotos?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return parsed ? plainToInstance(BusinessHoursDto, parsed) : parsed;
    } catch {
      return value;
    }
  })
  @ValidateNested()
  businessHours?: BusinessHoursDto;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: '설명은 1000자 이내로 입력해주세요' })
  description?: string;
}
