import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SearchAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query: string;

  @IsOptional()
  @IsString()
  @IsIn(['ko', 'en'])
  language?: 'ko' | 'en';
}
