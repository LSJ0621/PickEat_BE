import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBugReportDto {
  @IsString({ message: 'VALIDATION_STRING:category' })
  @IsNotEmpty({ message: 'VALIDATION_REQUIRED:category' })
  @MaxLength(50, { message: 'VALIDATION_MAX_LENGTH:category:50' })
  category: string;

  @IsString({ message: 'VALIDATION_STRING:title' })
  @IsNotEmpty({ message: 'VALIDATION_REQUIRED:title' })
  @MaxLength(30, { message: 'VALIDATION_MAX_LENGTH:title:30' })
  title: string;

  @IsString({ message: 'VALIDATION_STRING:description' })
  @IsNotEmpty({ message: 'VALIDATION_REQUIRED:description' })
  @MaxLength(500, { message: 'VALIDATION_MAX_LENGTH:description:500' })
  description: string;
}
