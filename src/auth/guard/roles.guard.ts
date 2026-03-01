import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@/common/constants/error-codes';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SUPER_ADMIN_KEY } from '../decorators/super-admin.decorator';
import { ROLES } from '@/common/constants/roles.constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(
      SUPER_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role: string } }>();
    const user = request.user;

    // Check super admin only restriction first
    if (superAdminOnly) {
      if (!user || !user.role) {
        throw new ForbiddenException({
          errorCode: ErrorCode.AUTH_ROLE_NOT_FOUND,
        });
      }

      if (user.role !== ROLES.SUPER_ADMIN) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ADMIN_SUPER_ADMIN_REQUIRED,
        });
      }

      return true;
    }

    if (!requiredRoles) {
      return true; // 역할 제한이 없으면 통과
    }

    if (!user || !user.role) {
      throw new ForbiddenException({
        errorCode: ErrorCode.AUTH_ROLE_NOT_FOUND,
      });
    }

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new ForbiddenException({
        errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      });
    }

    return true;
  }
}
