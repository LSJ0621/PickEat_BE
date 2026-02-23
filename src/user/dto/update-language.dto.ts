import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsLanguage } from '@/common/validators/language.validator';

export class UpdateLanguageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @IsIn(['ko', 'en'])
  @IsLanguage()
  language: 'ko' | 'en';
}
