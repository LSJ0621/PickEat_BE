import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminInitializerService } from '../../services/admin-initializer.service';
import { UserService } from '../../user.service';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

describe('AdminInitializerService', () => {
  let service: AdminInitializerService;
  let mockUserService: jest.Mocked<UserService>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserService = {
      findByEmail: jest.fn(),
      createUser: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
  });

  const createTestModule = async (config: Record<string, string>) => {
    mockConfigService = createMockConfigService(config);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminInitializerService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AdminInitializerService>(AdminInitializerService);
  };

  describe('onModuleInit', () => {
    it('should create admin user when credentials are provided and user does not exist', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
        ADMIN_NAME: 'Admin User',
        ADMIN_ROLE: 'ADMIN',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      const createdAdmin = UserFactory.createAdmin('admin@example.com');
      mockUserService.createUser.mockResolvedValue(createdAdmin);

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        'admin@example.com',
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('admin-password-123', 10);
      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'ADMIN',
        name: 'Admin User',
      });
    });

    it('should not create admin user when admin already exists', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
      });

      const existingAdmin = UserFactory.createAdmin('admin@example.com');
      mockUserService.findByEmail.mockResolvedValue(existingAdmin);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        'admin@example.com',
      );
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('should skip admin creation when ADMIN_EMAIL is not set', async () => {
      // Arrange
      await createTestModule({
        ADMIN_PASSWORD: 'admin-password-123',
      });

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('should skip admin creation when ADMIN_PASSWORD is not set', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
      });

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('should skip admin creation when both ADMIN_EMAIL and ADMIN_PASSWORD are not set', async () => {
      // Arrange
      await createTestModule({});

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('should use default name when ADMIN_NAME is not provided', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      const createdAdmin = UserFactory.createAdmin('admin@example.com');
      mockUserService.createUser.mockResolvedValue(createdAdmin);

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '관리자', // default name
        }),
      );
    });

    it('should use default role when ADMIN_ROLE is not provided', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      const createdAdmin = UserFactory.createAdmin('admin@example.com');
      mockUserService.createUser.mockResolvedValue(createdAdmin);

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'SUPER_ADMIN', // default role
        }),
      );
    });

    it('should use custom name when ADMIN_NAME is provided', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
        ADMIN_NAME: 'Custom Admin Name',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      const createdAdmin = UserFactory.createAdmin('admin@example.com');
      createdAdmin.name = 'Custom Admin Name';
      mockUserService.createUser.mockResolvedValue(createdAdmin);

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Admin Name',
        }),
      );
    });

    it('should use custom role when ADMIN_ROLE is provided', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
        ADMIN_ROLE: 'SUPER_ADMIN',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      const createdAdmin = UserFactory.createAdmin('admin@example.com');
      mockUserService.createUser.mockResolvedValue(createdAdmin);

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'SUPER_ADMIN',
        }),
      );
    });

    it('should hash password with bcrypt before saving', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'plaintext-password',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      const createdAdmin = UserFactory.createAdmin('admin@example.com');
      mockUserService.createUser.mockResolvedValue(createdAdmin);

      const hashedPassword = 'hashed-plaintext-password';
      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedPassword as never);

      // Act
      await service.onModuleInit();

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext-password', 10);
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          password: hashedPassword,
        }),
      );
    });

    it('should handle findByEmail returning a regular user', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
      });

      const regularUser = UserFactory.create({
        email: 'admin@example.com',
        role: 'USER',
      });
      mockUserService.findByEmail.mockResolvedValue(regularUser);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        'admin@example.com',
      );
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('should handle errors during admin creation', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.createUser.mockRejectedValue(new Error('Database error'));

      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      // Act & Assert
      await expect(service.onModuleInit()).rejects.toThrow('Database error');
    });

    it('should handle errors during password hashing', async () => {
      // Arrange
      await createTestModule({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'admin-password-123',
      });

      mockUserService.findByEmail.mockResolvedValue(null);
      jest
        .spyOn(bcrypt, 'hash')
        .mockRejectedValue(new Error('Hashing error') as never);

      // Act & Assert
      await expect(service.onModuleInit()).rejects.toThrow('Hashing error');
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });
  });
});
