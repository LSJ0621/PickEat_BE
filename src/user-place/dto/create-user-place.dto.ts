import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { IsS3PhotoUrl } from '@/common/validators/s3-url.validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class MenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsInt()
  @Min(0)
  @Max(9999999)
  price: number;
}

export class DayHoursDto {
  @IsString()
  @Matches(TIME_PATTERN, { message: '시간 형식은 HH:MM이어야 합니다' })
  open: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: '시간 형식은 HH:MM이어야 합니다' })
  close: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: '시간 형식은 HH:MM이어야 합니다' })
  breakStart?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: '시간 형식은 HH:MM이어야 합니다' })
  breakEnd?: string;
}

export class BusinessHoursDaysDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  mon?: DayHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  tue?: DayHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  wed?: DayHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  thu?: DayHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  fri?: DayHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  sat?: DayHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  sun?: DayHoursDto;
}

export class BusinessHoursDto {
  @IsBoolean()
  isOpen247: boolean;

  @IsBoolean()
  is24Hours: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDaysDto)
  days?: BusinessHoursDaysDto;
}

export class CreateUserPlaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @Type(() => Number)
  @IsLatitude()
  @IsNotEmpty()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  @IsNotEmpty()
  longitude: number;

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
  menuItems: MenuItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '사진은 최대 5장까지 업로드 가능합니다' })
  @IsUrl({}, { each: true, message: '유효한 URL 형식이어야 합니다' })
  @IsS3PhotoUrl({ each: true })
  photos?: string[];

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
