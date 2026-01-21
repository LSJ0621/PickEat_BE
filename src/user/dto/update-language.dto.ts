import { IsNotEmpty, IsString } from 'class-validator';
import { IsLanguage } from '@/common/validators/language.validator';

export class UpdateLanguageDto {
  @IsString()
  @IsNotEmpty()
  @IsLanguage()
  language: 'ko' | 'en';
}
