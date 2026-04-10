import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { ROLES_KEY } from '@/auth/decorators/roles.decorator';
import { SUPER_ADMIN_KEY } from '@/auth/decorators/super-admin.decorator';
import { ErrorCode } from '@/common/constants/error-codes';
import { ROLES } from '@/common/constants/roles.constants';

function createMockExecutionContext(
  userRole: string | undefined,
): ExecutionContext {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: userRole ? { role: userRole } : undefined,
      }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

/** ForbiddenException의 response body에서 errorCode를 추출 */
function catchForbidden(fn: () => void): ForbiddenException {
  let caught: ForbiddenException | undefined;
  try {
    fn();
  } catch (e) {
    caught = e as ForbiddenException;
  }
  return caught!;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ── 일반 역할 검사 ──────────────────────────────────────────────────────────

  it('ADMIN 역할이 필요하고 사용자가 ADMIN이면 true를 반환한다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)       // superAdminOnly
      .mockReturnValueOnce([ROLES.ADMIN]); // requiredRoles

    const result = guard.canActivate(createMockExecutionContext(ROLES.ADMIN));

    expect(result).toBe(true);
  });

  it('ADMIN 역할이 필요하고 사용자가 USER이면 ForbiddenException(AUTH_INSUFFICIENT_PERMISSIONS)을 던진다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([ROLES.ADMIN]);

    const error = catchForbidden(() =>
      guard.canActivate(createMockExecutionContext(ROLES.USER)),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    });
  });

  it('역할이 필요한데 유저 정보가 없으면 ForbiddenException(AUTH_ROLE_NOT_FOUND)을 던진다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([ROLES.ADMIN]);

    const error = catchForbidden(() =>
      guard.canActivate(createMockExecutionContext(undefined)),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      errorCode: ErrorCode.AUTH_ROLE_NOT_FOUND,
    });
  });

  it('역할 제한이 없으면 모든 사용자가 통과한다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(null); // requiredRoles = null

    const result = guard.canActivate(createMockExecutionContext(ROLES.USER));

    expect(result).toBe(true);
  });

  // ── superAdminOnly 분기 ────────────────────────────────────────────────────

  it('superAdminOnly이고 SUPER_ADMIN이면 true를 반환한다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(true)  // superAdminOnly
      .mockReturnValueOnce(null); // requiredRoles (사용되지 않음)

    const result = guard.canActivate(
      createMockExecutionContext(ROLES.SUPER_ADMIN),
    );

    expect(result).toBe(true);
  });

  it('superAdminOnly인데 ADMIN이면 ForbiddenException(ADMIN_SUPER_ADMIN_REQUIRED)을 던진다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(null);

    const error = catchForbidden(() =>
      guard.canActivate(createMockExecutionContext(ROLES.ADMIN)),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      errorCode: ErrorCode.ADMIN_SUPER_ADMIN_REQUIRED,
    });
  });

  it('superAdminOnly인데 유저가 없으면 ForbiddenException(AUTH_ROLE_NOT_FOUND)을 던진다', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(null);

    const error = catchForbidden(() =>
      guard.canActivate(createMockExecutionContext(undefined)),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      errorCode: ErrorCode.AUTH_ROLE_NOT_FOUND,
    });
  });
});
