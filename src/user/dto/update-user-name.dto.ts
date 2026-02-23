import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateUserNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
