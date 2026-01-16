import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateLanguageDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['ko', 'en'])
  language: string;
}
