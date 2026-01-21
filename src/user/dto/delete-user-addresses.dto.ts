import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class DeleteUserAddressesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'VALIDATION_ARRAY_MIN:ids:1' })
  @ArrayMaxSize(3, { message: 'VALIDATION_ARRAY_MAX:ids:3' })
  @IsNumber({}, { each: true })
  ids: number[];
}
