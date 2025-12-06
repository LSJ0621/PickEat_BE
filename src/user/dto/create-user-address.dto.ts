import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AddressSearchResult } from '../interfaces/address-search-result.interface';

export class CreateUserAddressDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AddressSearchResult)
  @IsNotEmpty()
  selectedAddress: AddressSearchResult; // 카카오 API 검색 결과

  @IsString()
  @IsOptional()
  alias?: string; // 주소 별칭 (선택사항)

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean; // 기본 주소로 설정할지 여부

  @IsBoolean()
  @IsOptional()
  isSearchAddress?: boolean; // 검색 주소로 설정할지 여부
}

