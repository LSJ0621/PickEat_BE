import { IsBoolean, IsOptional } from 'class-validator';
import { MenuPayloadDto } from './menu-payload.dto';

export class UpdateMenuSelectionDto extends MenuPayloadDto {

  @IsOptional()
  @IsBoolean()
  cancel?: boolean;
}
