import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserPlaceStatus } from '../enum/user-place-status.enum';

export class UserPlaceListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @IsEnum(UserPlaceStatus)
  @IsOptional()
  status?: UserPlaceStatus;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  search?: string;
}
