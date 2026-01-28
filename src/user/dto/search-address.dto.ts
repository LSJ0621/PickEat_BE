import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchAddressDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsString()
  @IsIn(['ko', 'en'])
  language?: 'ko' | 'en';
}
