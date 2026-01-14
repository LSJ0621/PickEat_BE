import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
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
  search?: string;

  @IsOptional()
  @IsEnum(['createdAt', 'lastActiveAt', 'name'])
  sortBy?: 'createdAt' | 'lastActiveAt' | 'name' = 'createdAt';

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
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
