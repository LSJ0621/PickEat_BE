import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBugReportDto {
  @IsString({ message: '카테고리는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '카테고리는 필수입니다.' })
  @MaxLength(50, { message: '카테고리는 최대 50자까지 입력 가능합니다.' })
  category: string;

  @IsString({ message: '제목은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '제목은 필수입니다.' })
  @MaxLength(30, { message: '제목은 최대 30자까지 입력 가능합니다.' })
  title: string;

  @IsString({ message: '상세 내용은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '상세 내용은 필수입니다.' })
  @MaxLength(500, { message: '상세 내용은 최대 500자까지 입력 가능합니다.' })
  description: string;
}


