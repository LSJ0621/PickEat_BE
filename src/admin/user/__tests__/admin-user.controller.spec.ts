import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { AdminUserController } from '../admin-user.controller';
import { AdminUserService } from '../admin-user.service';
import { UserService } from '@/user/user.service';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { MessageCode } from '@/common/constants/message-codes';
import { ROLES } from '@/common/constants/roles.constants';
import { User } from '@/user/entities/user.entity';
import { AdminUserListQueryDto } from '../dto/admin-user-list-query.dto';

describe('AdminUserController', () => {
  let controller: AdminUserController;
  let mockAdminUserService: jest.Mocked<AdminUserService>;
  let mockUserService: jest.Mocked<UserService>;

  const mockAdminPayload: AuthUserPayload = {
    sub: 1,
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const mockSuperAdminPayload: AuthUserPayload = {
    sub: 2,
    email: 'superadmin@example.com',
    role: 'SUPER_ADMIN',
  };

  const mockAdminUser: User = {
    id: 1,
    email: 'admin@example.com',
    password: null,
    name: 'Admin User',
    birthDate: null,
    gender: null,
    role: ROLES.ADMIN,
    emailVerified: true,
    reRegisterEmailVerified: false,
    preferences: null,
    preferredLanguage: 'ko',
    socialId: null,
    socialType: null,
    lastPasswordChangedAt: null,
    isDeactivated: false,
    deactivatedAt: null,
    lastActiveAt: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    version: 1,
    addresses: [],
    recommendations: [],
    menuSelections: [],
    tasteAnalysis: null,
  } as User;

  function createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      ...overrides,
    } as unknown as Request;
  }

  beforeEach(async () => {
    mockAdminUserService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      deactivate: jest.fn(),
      activate: jest.fn(),
    } as unknown as jest.Mocked<AdminUserService>;

    mockUserService = {
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUserController],
      providers: [
        { provide: AdminUserService, useValue: mockAdminUserService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    controller = module.get<AdminUserController>(AdminUserController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated user list when admin requests it', async () => {
      const query: AdminUserListQueryDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [
          {
            id: 10,
            email: 'user@example.com',
            name: 'Test User',
            socialType: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            status: 'active' as const,
          },
        ],
        pageInfo: { page: 1, limit: 20, totalCount: 1, hasNext: false },
      };

      mockUserService.findByEmail.mockResolvedValue(mockAdminUser);
      mockAdminUserService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query, mockAdminPayload);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        mockAdminPayload.email,
      );
      expect(mockAdminUserService.findAll).toHaveBeenCalledWith(
        query,
        ROLES.ADMIN,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should pass SUPER_ADMIN role to service when super admin requests list', async () => {
      const query: AdminUserListQueryDto = { page: 1, limit: 20, role: 'USER' };
      const superAdminUser = { ...mockAdminUser, role: ROLES.SUPER_ADMIN };
      const expectedResult = {
        items: [],
        pageInfo: { page: 1, limit: 20, totalCount: 0, hasNext: false },
      };

      mockUserService.findByEmail.mockResolvedValue(superAdminUser as User);
      mockAdminUserService.findAll.mockResolvedValue(expectedResult);

      await controller.findAll(query, mockSuperAdminPayload);

      expect(mockAdminUserService.findAll).toHaveBeenCalledWith(
        query,
        ROLES.SUPER_ADMIN,
      );
    });

    it('should throw NotFoundException when requesting admin user is not found', async () => {
      const query: AdminUserListQueryDto = {};
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(controller.findAll(query, mockAdminPayload)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockAdminUserService.findAll).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe('findOne', () => {
    it('should return user detail when valid user id is provided', async () => {
      const expectedDetail = {
        id: 10,
        email: 'user@example.com',
        name: 'Test User',
        socialType: null,
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deletedAt: null,
        isDeactivated: false,
        preferences: null,
        addresses: [],
        stats: { menuRecommendations: 5, menuSelections: 3, bugReports: 1 },
        recentActivities: { recommendations: [], bugReports: [] },
      };

      mockAdminUserService.findOne.mockResolvedValue(expectedDetail);

      const result = await controller.findOne(10);

      expect(mockAdminUserService.findOne).toHaveBeenCalledWith(10);
      expect(result).toEqual(expectedDetail);
    });

    it('should propagate NotFoundException when user id does not exist', async () => {
      mockAdminUserService.findOne.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // deactivate
  // ─────────────────────────────────────────────
  describe('deactivate', () => {
    it('should deactivate user and return success response when valid request is made', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      mockUserService.findByEmail.mockResolvedValue(mockAdminUser);
      mockAdminUserService.deactivate.mockResolvedValue(undefined);

      const result = await controller.deactivate(10, mockAdminPayload, req);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        mockAdminPayload.email,
      );
      expect(mockAdminUserService.deactivate).toHaveBeenCalledWith(
        10,
        mockAdminUser.id,
        ROLES.ADMIN,
        '192.168.1.1',
      );
      expect(result).toEqual({
        success: true,
        messageCode: MessageCode.ADMIN_USER_DEACTIVATED,
      });
    });

    it('should extract IP from x-forwarded-for header when behind proxy', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.0.1' },
      });

      mockUserService.findByEmail.mockResolvedValue(mockAdminUser);
      mockAdminUserService.deactivate.mockResolvedValue(undefined);

      await controller.deactivate(10, mockAdminPayload, req);

      expect(mockAdminUserService.deactivate).toHaveBeenCalledWith(
        10,
        mockAdminUser.id,
        ROLES.ADMIN,
        '10.0.0.1',
      );
    });

    it('should throw NotFoundException when requesting admin user is not found', async () => {
      const req = createMockRequest();
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(
        controller.deactivate(10, mockAdminPayload, req),
      ).rejects.toThrow(NotFoundException);

      expect(mockAdminUserService.deactivate).not.toHaveBeenCalled();
    });

    it('should use req.ip as fallback when x-forwarded-for header is missing', async () => {
      const req = createMockRequest({ headers: {}, ip: '10.10.10.10' });

      mockUserService.findByEmail.mockResolvedValue(mockAdminUser);
      mockAdminUserService.deactivate.mockResolvedValue(undefined);

      await controller.deactivate(10, mockAdminPayload, req);

      expect(mockAdminUserService.deactivate).toHaveBeenCalledWith(
        10,
        mockAdminUser.id,
        ROLES.ADMIN,
        '10.10.10.10',
      );
    });
  });

  // ─────────────────────────────────────────────
  // activate
  // ─────────────────────────────────────────────
  describe('activate', () => {
    it('should activate user and return success response when valid request is made', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      mockUserService.findByEmail.mockResolvedValue(mockAdminUser);
      mockAdminUserService.activate.mockResolvedValue(undefined);

      const result = await controller.activate(10, mockAdminPayload, req);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        mockAdminPayload.email,
      );
      expect(mockAdminUserService.activate).toHaveBeenCalledWith(
        10,
        mockAdminUser.id,
        ROLES.ADMIN,
        '192.168.1.1',
      );
      expect(result).toEqual({
        success: true,
        messageCode: MessageCode.ADMIN_USER_ACTIVATED,
      });
    });

    it('should throw NotFoundException when requesting admin user is not found', async () => {
      const req = createMockRequest();
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(
        controller.activate(10, mockAdminPayload, req),
      ).rejects.toThrow(NotFoundException);

      expect(mockAdminUserService.activate).not.toHaveBeenCalled();
    });

    it('should extract first IP when x-forwarded-for header is an array', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': ['10.0.0.1', '192.168.0.1'] },
      });

      mockUserService.findByEmail.mockResolvedValue(mockAdminUser);
      mockAdminUserService.activate.mockResolvedValue(undefined);

      await controller.activate(10, mockAdminPayload, req);

      expect(mockAdminUserService.activate).toHaveBeenCalledWith(
        10,
        mockAdminUser.id,
        ROLES.ADMIN,
        '10.0.0.1',
      );
    });
  });
});
