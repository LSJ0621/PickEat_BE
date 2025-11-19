import { IsNotEmpty, IsString } from 'class-validator';

export class SearchAddressDto {
  @IsString()
  @IsNotEmpty()
  query: string;
}
