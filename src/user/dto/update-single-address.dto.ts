import { IsNotEmpty, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressSearchResult } from '../interfaces/address-search-result.interface';

export class UpdateSingleAddressDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AddressSearchResult)
  @IsNotEmpty()
  selectedAddress: AddressSearchResult;
}

