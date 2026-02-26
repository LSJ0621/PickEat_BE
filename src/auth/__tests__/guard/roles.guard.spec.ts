import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '../../guard/roles.guard';
import { ROLES_KEY } from '../../decorators/roles.decorator';
import { SUPER_ADMIN_KEY } from '../../decorators/super-admin.decorator';
import { ROLES } from '@/common/constants/roles.constants';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let mockReflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(async () => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
  });

  const createMockExecutionContext = (user?: {
    role: string;
  }): ExecutionContext => {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  describe('canActivate', () => {
    it('should allow access when no roles are required', () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockExecutionContext({ role: 'USER' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('should allow access when user has required role', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN']);
      const context = createMockExecutionContext({ role: 'ADMIN' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access when user has one of the required roles', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN', 'MODERATOR']);
      const context = createMockExecutionContext({ role: 'ADMIN' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow USER role when required', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['USER']);
      const context = createMockExecutionContext({ role: 'USER' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN'])
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN']);
      const context = createMockExecutionContext({ role: 'USER' });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Insufficient permissions',
      );
    });

    it('should throw ForbiddenException when user does not have any of the required roles', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN', 'MODERATOR'])
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN', 'MODERATOR']);
      const context = createMockExecutionContext({ role: 'USER' });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Insufficient permissions',
      );
    });

    it('should throw ForbiddenException when user is not in request', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN'])
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN']);
      const context = createMockExecutionContext(undefined);

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('User role not found');
    });

    it('should throw ForbiddenException when user has no role property', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN'])
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN']);
      const context = createMockExecutionContext({} as { role: string });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('User role not found');
    });

    it('should throw ForbiddenException when required roles array is empty but present', () => {
      // Arrange - empty array means no role matches
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce([]);
      const context = createMockExecutionContext({ role: 'USER' });

      // Act & Assert
      // Empty array [] is not the same as undefined/null
      // [] means "require one of these roles: (none)" which will always fail
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should be case-sensitive for role comparison', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['admin']);
      const context = createMockExecutionContext({ role: 'ADMIN' });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should retrieve roles from both handler and class', () => {
      // Arrange
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['ADMIN']);
      const context = createMockExecutionContext({ role: 'ADMIN' });

      // Act
      guard.canActivate(context);

      // Assert
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    describe('superAdminOnly branch', () => {
      it('should return true when superAdminOnly is set and user is SUPER_ADMIN', () => {
        // Arrange - first call returns superAdminOnly=true, second call for requiredRoles is not reached
        mockReflector.getAllAndOverride
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(undefined);
        const context = createMockExecutionContext({ role: ROLES.SUPER_ADMIN });

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
        expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
          SUPER_ADMIN_KEY,
          [context.getHandler(), context.getClass()],
        );
      });

      it('should throw ForbiddenException when superAdminOnly is set but user has no role', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValueOnce(true);
        const context = createMockExecutionContext(undefined);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => {
          mockReflector.getAllAndOverride.mockReturnValueOnce(true);
          guard.canActivate(context);
        }).toThrow('User role not found');
      });

      it('should throw ForbiddenException when superAdminOnly is set and user role is empty string', () => {
        // Arrange - empty string is falsy, treated as missing role
        mockReflector.getAllAndOverride
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(true);
        const context = createMockExecutionContext({ role: '' });

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => {
          mockReflector.getAllAndOverride.mockReturnValueOnce(true);
          guard.canActivate(createMockExecutionContext({ role: '' }));
        }).toThrow('User role not found');
      });

      it('should throw ForbiddenException when superAdminOnly is set but user is regular ADMIN', () => {
        // Arrange
        mockReflector.getAllAndOverride
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(true);
        const context = createMockExecutionContext({ role: ROLES.ADMIN });

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => {
          mockReflector.getAllAndOverride.mockReturnValueOnce(true);
          guard.canActivate(createMockExecutionContext({ role: ROLES.ADMIN }));
        }).toThrow('This action requires Super Admin privileges');
      });

      it('should throw ForbiddenException when superAdminOnly is set but user is USER role', () => {
        // Arrange
        mockReflector.getAllAndOverride
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(true);
        const context = createMockExecutionContext({ role: 'USER' });

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow(
          'This action requires Super Admin privileges',
        );
      });
    });
  });
});
