import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserAddressDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  roadAddress?: string; // 도로명 주소

  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  alias?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isSearchAddress?: boolean;
}
