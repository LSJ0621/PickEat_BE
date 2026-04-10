import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';

function createMockExecutionContext(): ExecutionContext {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({}),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const JwtStrategy = AuthGuard('jwt');
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
    jest.restoreAllMocks();
  });

  it('유효한 토큰이면 canActivate가 true를 반환한다', async () => {
    jest.spyOn(JwtStrategy.prototype, 'canActivate').mockResolvedValue(true);
    const context = createMockExecutionContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('만료된 토큰이면 UnauthorizedException을 던진다', async () => {
    jest
      .spyOn(JwtStrategy.prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException('Token expired'));
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('토큰이 없으면 UnauthorizedException을 던진다', async () => {
    jest
      .spyOn(JwtStrategy.prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException('No auth token'));
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('잘못된 형식의 토큰이면 UnauthorizedException을 던진다', async () => {
    jest
      .spyOn(JwtStrategy.prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException('Invalid token format'));
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
