import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { AdminSettingsController } from '../admin-settings.controller';
import { AdminSettingsService } from '../admin-settings.service';
import { UserService } from '@/user/user.service';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { ROLES } from '@/common/constants/roles.constants';
import { User } from '@/user/entities/user.entity';
import { PromoteAdminDto } from '../dto/promote-admin.dto';

describe('AdminSettingsController', () => {
  let controller: AdminSettingsController;
  let mockAdminSettingsService: jest.Mocked<AdminSettingsService>;
  let mockUserService: jest.Mocked<UserService>;

  const mockSuperAdminPayload: AuthUserPayload = {
    sub: 1,
    email: 'superadmin@example.com',
    role: 'SUPER_ADMIN',
  };

  const mockSuperAdminUser: User = {
    id: 1,
    email: 'superadmin@example.com',
    password: null,
    name: 'Super Admin',
    birthDate: null,
    gender: null,
    role: ROLES.SUPER_ADMIN,
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
    lastLoginAt: new Date('2024-01-10'),
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
    mockAdminSettingsService = {
      getAdminList: jest.fn(),
      promoteToAdmin: jest.fn(),
      demoteAdmin: jest.fn(),
    } as unknown as jest.Mocked<AdminSettingsService>;

    mockUserService = {
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSettingsController],
      providers: [
        { provide: AdminSettingsService, useValue: mockAdminSettingsService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    controller = module.get<AdminSettingsController>(AdminSettingsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // getAdminList
  // ─────────────────────────────────────────────
  describe('getAdminList', () => {
    it('should return list of admin users when requested', async () => {
      const expectedAdmins = [
        {
          id: 1,
          email: 'superadmin@example.com',
          name: 'Super Admin',
          role: ROLES.SUPER_ADMIN,
          lastLoginAt: '2024-01-10T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          email: 'admin@example.com',
          name: 'Admin User',
          role: ROLES.ADMIN,
          lastLoginAt: null,
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      mockAdminSettingsService.getAdminList.mockResolvedValue(expectedAdmins);

      const result = await controller.getAdminList();

      expect(mockAdminSettingsService.getAdminList).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedAdmins);
    });

    it('should return empty array when no admin users exist', async () => {
      mockAdminSettingsService.getAdminList.mockResolvedValue([]);

      const result = await controller.getAdminList();

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // promoteToAdmin
  // ─────────────────────────────────────────────
  describe('promoteToAdmin', () => {
    it('should promote user to admin and return success message when userId is provided', async () => {
      const dto: PromoteAdminDto = { userId: 10, role: ROLES.ADMIN };
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.promoteToAdmin.mockResolvedValue(undefined);

      const result = await controller.promoteToAdmin(
        dto,
        mockSuperAdminPayload,
        req,
      );

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        mockSuperAdminPayload.email,
      );
      expect(mockAdminSettingsService.promoteToAdmin).toHaveBeenCalledWith(
        10,
        undefined,
        ROLES.ADMIN,
        mockSuperAdminUser,
        '192.168.1.1',
      );
      expect(result).toEqual({
        message: `User promoted to ${ROLES.ADMIN} successfully`,
      });
    });

    it('should promote user to admin using email identifier when email is provided', async () => {
      const dto: PromoteAdminDto = {
        email: 'user@example.com',
        role: ROLES.ADMIN,
      };
      const req = createMockRequest({ headers: {} });

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.promoteToAdmin.mockResolvedValue(undefined);

      await controller.promoteToAdmin(dto, mockSuperAdminPayload, req);

      expect(mockAdminSettingsService.promoteToAdmin).toHaveBeenCalledWith(
        undefined,
        'user@example.com',
        ROLES.ADMIN,
        mockSuperAdminUser,
        expect.any(String),
      );
    });

    it('should promote user to SUPER_ADMIN role when SUPER_ADMIN role is specified', async () => {
      const dto: PromoteAdminDto = { userId: 5, role: ROLES.SUPER_ADMIN };
      const req = createMockRequest();

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.promoteToAdmin.mockResolvedValue(undefined);

      const result = await controller.promoteToAdmin(
        dto,
        mockSuperAdminPayload,
        req,
      );

      expect(mockAdminSettingsService.promoteToAdmin).toHaveBeenCalledWith(
        5,
        undefined,
        ROLES.SUPER_ADMIN,
        mockSuperAdminUser,
        expect.any(String),
      );
      expect(result).toEqual({
        message: `User promoted to ${ROLES.SUPER_ADMIN} successfully`,
      });
    });

    it('should throw NotFoundException when requesting super admin user is not found', async () => {
      const dto: PromoteAdminDto = { userId: 10, role: ROLES.ADMIN };
      const req = createMockRequest();
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(
        controller.promoteToAdmin(dto, mockSuperAdminPayload, req),
      ).rejects.toThrow(NotFoundException);

      expect(mockAdminSettingsService.promoteToAdmin).not.toHaveBeenCalled();
    });

    it('should extract IP from x-forwarded-for header when behind proxy', async () => {
      const dto: PromoteAdminDto = { userId: 10, role: ROLES.ADMIN };
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.5, 172.16.0.1' },
      });

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.promoteToAdmin.mockResolvedValue(undefined);

      await controller.promoteToAdmin(dto, mockSuperAdminPayload, req);

      expect(mockAdminSettingsService.promoteToAdmin).toHaveBeenCalledWith(
        10,
        undefined,
        ROLES.ADMIN,
        mockSuperAdminUser,
        '10.0.0.5',
      );
    });
  });

  // ─────────────────────────────────────────────
  // demoteAdmin
  // ─────────────────────────────────────────────
  describe('demoteAdmin', () => {
    it('should demote admin and return success message when valid request is made', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.demoteAdmin.mockResolvedValue(undefined);

      const result = await controller.demoteAdmin(
        5,
        mockSuperAdminPayload,
        req,
      );

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        mockSuperAdminPayload.email,
      );
      expect(mockAdminSettingsService.demoteAdmin).toHaveBeenCalledWith(
        5,
        mockSuperAdminUser,
        '192.168.1.1',
      );
      expect(result).toEqual({ message: 'Admin role removed successfully' });
    });

    it('should throw NotFoundException when requesting super admin user is not found', async () => {
      const req = createMockRequest();
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(
        controller.demoteAdmin(5, mockSuperAdminPayload, req),
      ).rejects.toThrow(NotFoundException);

      expect(mockAdminSettingsService.demoteAdmin).not.toHaveBeenCalled();
    });

    it('should use req.ip as fallback when x-forwarded-for header is missing', async () => {
      const req = createMockRequest({ headers: {}, ip: '172.16.0.100' });

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.demoteAdmin.mockResolvedValue(undefined);

      await controller.demoteAdmin(5, mockSuperAdminPayload, req);

      expect(mockAdminSettingsService.demoteAdmin).toHaveBeenCalledWith(
        5,
        mockSuperAdminUser,
        '172.16.0.100',
      );
    });

    it('should extract first IP when x-forwarded-for header is an array', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': ['10.0.0.1', '192.168.0.1'] },
      });

      mockUserService.findByEmail.mockResolvedValue(mockSuperAdminUser);
      mockAdminSettingsService.demoteAdmin.mockResolvedValue(undefined);

      await controller.demoteAdmin(5, mockSuperAdminPayload, req);

      expect(mockAdminSettingsService.demoteAdmin).toHaveBeenCalledWith(
        5,
        mockSuperAdminUser,
        '10.0.0.1',
      );
    });
  });
});
