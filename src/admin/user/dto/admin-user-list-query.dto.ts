import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdminUserListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(['createdAt', 'lastActiveAt', 'name', 'email'])
  sortBy?: 'createdAt' | 'lastActiveAt' | 'name' | 'email' = 'createdAt';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsEnum(['EMAIL', 'KAKAO', 'GOOGLE'])
  socialType?: 'EMAIL' | 'KAKAO' | 'GOOGLE';

  @IsOptional()
  @IsEnum(['active', 'deleted', 'deactivated'])
  status?: 'active' | 'deleted' | 'deactivated';

  @IsOptional()
  @IsEnum(['USER', 'ADMIN', 'SUPER_ADMIN'])
  role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN';

  @IsOptional()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'VALIDATION_DATE_FORMAT:startDate',
  })
  startDate?: string;

  @IsOptional()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'VALIDATION_DATE_FORMAT:endDate',
  })
  endDate?: string;
}
