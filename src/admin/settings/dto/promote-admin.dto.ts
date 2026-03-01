import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  MaxLength,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ROLES } from '@/common/constants/roles.constants';

const ADMIN_ROLES = [ROLES.ADMIN] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

@ValidatorConstraint({ name: 'atLeastOneIdentifier', async: false })
export class AtLeastOneIdentifierConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as PromoteAdminDto;
    return !!(obj.userId || obj.email);
  }

  defaultMessage(): string {
    return 'Either userId or email must be provided';
  }
}

export class PromoteAdminDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Validate(AtLeastOneIdentifierConstraint)
  userId?: number;

  @ValidateIf((o) => !o.userId)
  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsEnum(ADMIN_ROLES)
  role: AdminRole;
}
