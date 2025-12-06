import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AddressSearchResult } from '../interfaces/address-search-result.interface';
import { CreateUserAddressDto } from './create-user-address.dto';

export class CreateUserAddressesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUserAddressDto)
  @IsNotEmpty()
  addresses: CreateUserAddressDto[];
}

