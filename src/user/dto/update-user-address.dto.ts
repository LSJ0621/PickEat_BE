import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateUserAddressDto {
  @IsString()
  @IsOptional()
  roadAddress?: string; // 도로명 주소

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  alias?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isSearchAddress?: boolean;
}
