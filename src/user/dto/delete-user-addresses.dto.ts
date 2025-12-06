import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class DeleteUserAddressesDto {
  @IsArray()
  @ArrayMinSize(1, { message: '최소 1개 이상의 주소를 선택해야 합니다.' })
  @ArrayMaxSize(3, { message: '최대 3개까지 삭제할 수 있습니다.' })
  @IsNumber({}, { each: true })
  ids: number[];
}

