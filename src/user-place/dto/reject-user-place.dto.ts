import { IsString, MinLength, MaxLength } from 'class-validator';

export class RejectUserPlaceDto {
  @IsString()
  @MinLength(10, { message: '거절 사유는 최소 10자 이상 입력해주세요.' })
  @MaxLength(500, { message: '거절 사유는 500자를 초과할 수 없습니다.' })
  reason: string;
}
