import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum MenuSlot {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
  ETC = 'etc',
}

class MenuItemDto {
  @IsEnum(MenuSlot)
  slot: MenuSlot;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateMenuSelectionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menus: MenuItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  historyId?: number;
}
