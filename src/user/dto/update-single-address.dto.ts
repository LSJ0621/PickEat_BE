import { IsNotEmpty, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressSearchResult } from './address-search-result.dto';

export class UpdateSingleAddressDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AddressSearchResult)
  @IsNotEmpty()
  selectedAddress: AddressSearchResult;
}
