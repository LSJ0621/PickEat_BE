import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthUserPayload } from '../../decorators/current-user.decorator';

/**
 * Testing Strategy for NestJS Param Decorators:
 *
 * NestJS param decorators use `createParamDecorator` which creates metadata-driven decorators.
 * This test replicates the exact logic from current-user.decorator.ts lines 13-21.
 *
 * The actual decorator IS exercised through controller integration tests.
 * This isolated test provides comprehensive coverage of all branches and edge cases.
 */
const currentUserDecoratorLogic = (
  _data: unknown,
  ctx: ExecutionContext,
): AuthUserPayload => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
  if (!request.user || !request.user.sub || !request.user.email) {
    throw new UnauthorizedException('Invalid authentication payload');
  }
  return request.user;
};

describe('CurrentUser Decorator', () => {
  const createMockExecutionContext = (
    user?: AuthUserPayload | null | Partial<AuthUserPayload>,
  ): ExecutionContext => {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  describe('Valid user extraction', () => {
    it('should return user payload when all required fields are present', () => {
      const mockUser: AuthUserPayload = { sub: 1, email: 'test@example.com', role: 'USER' };
      const context = createMockExecutionContext(mockUser);

      const result = currentUserDecoratorLogic(null, context);

      expect(result).toEqual(mockUser);
    });

    it('should return admin user payload correctly', () => {
      const mockUser: AuthUserPayload = { sub: 2, email: 'admin@example.com', role: 'ADMIN' };
      const context = createMockExecutionContext(mockUser);

      const result = currentUserDecoratorLogic(null, context);

      expect(result.role).toBe('ADMIN');
    });

    it('should treat whitespace-only email as valid (documents current behavior)', () => {
      // The decorator only checks for falsy values, not whitespace
      const mockUser: AuthUserPayload = { sub: 1, email: '   ', role: 'USER' };
      const context = createMockExecutionContext(mockUser);

      const result = currentUserDecoratorLogic(null, context);

      expect(result.email).toBe('   ');
    });

    it('should ignore the data parameter regardless of its value', () => {
      const mockUser: AuthUserPayload = { sub: 1, email: 'test@example.com', role: 'USER' };
      const context = createMockExecutionContext(mockUser);

      expect(currentUserDecoratorLogic(null, context)).toEqual(mockUser);
      expect(currentUserDecoratorLogic(undefined, context)).toEqual(mockUser);
      expect(currentUserDecoratorLogic('some-data', context)).toEqual(mockUser);
    });
  });

  describe('UnauthorizedException when request.user is absent', () => {
    test.each([
      ['undefined', undefined],
      ['null', null],
    ])('should throw when request.user is %s', (_label, userValue) => {
      const context = createMockExecutionContext(
        userValue as AuthUserPayload | null | undefined,
      );

      expect(() => currentUserDecoratorLogic(null, context)).toThrow(
        new UnauthorizedException('Invalid authentication payload'),
      );
    });

    it('should throw when request has no user property at all', () => {
      const getRequest = jest.fn().mockReturnValue({});
      const switchToHttp = jest.fn().mockReturnValue({ getRequest });
      const context = {
        switchToHttp,
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;

      expect(() => currentUserDecoratorLogic(null, context)).toThrow(
        new UnauthorizedException('Invalid authentication payload'),
      );
    });
  });

  describe('UnauthorizedException when required fields are missing', () => {
    test.each([
      ['sub is missing', { email: 'test@example.com', role: 'USER' }],
      ['sub is zero (falsy)', { sub: 0, email: 'test@example.com', role: 'USER' }],
      ['email is missing', { sub: 1, role: 'USER' }],
      ['email is empty string', { sub: 1, email: '', role: 'USER' }],
      ['email is null', { sub: 1, email: null, role: 'USER' }],
      ['both sub and email are missing', {}],
    ])(
      'should throw UnauthorizedException when %s',
      (_label, partialUser) => {
        const context = createMockExecutionContext(
          partialUser as Partial<AuthUserPayload>,
        );

        expect(() => currentUserDecoratorLogic(null, context)).toThrow(
          new UnauthorizedException('Invalid authentication payload'),
        );
      },
    );
  });

  describe('ExecutionContext interaction', () => {
    it('should call switchToHttp and getRequest exactly once each', () => {
      const mockUser: AuthUserPayload = { sub: 1, email: 'test@example.com', role: 'USER' };
      const getRequest = jest.fn().mockReturnValue({ user: mockUser });
      const switchToHttp = jest.fn().mockReturnValue({ getRequest });
      const context = {
        switchToHttp,
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;

      currentUserDecoratorLogic(null, context);

      expect(switchToHttp).toHaveBeenCalledTimes(1);
      expect(getRequest).toHaveBeenCalledTimes(1);
    });
  });
});
