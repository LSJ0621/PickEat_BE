import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailLogService } from '../services/email-log.service';
import { EmailLog } from '../entities/email-log.entity';
import { EMAIL_PURPOSES } from '../monitoring.constants';
import { createMockRepository } from '../../../../test/mocks/repository.mock';

describe('EmailLogService', () => {
  let service: EmailLogService;
  let mockRepository: ReturnType<typeof createMockRepository<EmailLog>>;

  beforeEach(async () => {
    mockRepository = createMockRepository<EmailLog>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailLogService,
        {
          provide: getRepositoryToken(EmailLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<EmailLogService>(EmailLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logSuccess', () => {
    it('should create and save successful email log with masked recipient', async () => {
      // Arrange
      const recipient = 'test@example.com';
      const purpose = EMAIL_PURPOSES.SIGNUP;
      const mockEntity = {
        id: 'test-id',
        recipient: 't***@example.com',
        purpose,
        success: true,
        errorMessage: null,
      } as EmailLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.logSuccess(recipient, purpose);

      // Assert
      expect(mockRepository.create).toHaveBeenCalledWith({
        recipient: 'te***@example.com',
        purpose,
        success: true,
        errorMessage: null,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockEntity);
      expect(result).toEqual(mockEntity);
    });

    it('should log password reset email success', async () => {
      // Arrange
      const recipient = 'user@example.com';
      const purpose = EMAIL_PURPOSES.PASSWORD_RESET;
      const mockEntity = {
        id: 'test-id',
        recipient: 'u***@example.com',
        purpose,
        success: true,
        errorMessage: null,
      } as EmailLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.logSuccess(recipient, purpose);

      // Assert
      expect(result.success).toBe(true);
      expect(result.purpose).toBe(EMAIL_PURPOSES.PASSWORD_RESET);
    });

    it('should log re-register email success', async () => {
      // Arrange
      const recipient = 'john.doe@company.com';
      const purpose = EMAIL_PURPOSES.RE_REGISTER;
      const mockEntity = {
        id: 'test-id',
        recipient: 'joh***@company.com',
        purpose,
        success: true,
        errorMessage: null,
      } as EmailLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.logSuccess(recipient, purpose);

      // Assert
      expect(result.success).toBe(true);
      expect(result.purpose).toBe(EMAIL_PURPOSES.RE_REGISTER);
    });
  });

  describe('logFailure', () => {
    it('should create and save failed email log with error message', async () => {
      // Arrange
      const recipient = 'test@example.com';
      const purpose = EMAIL_PURPOSES.SIGNUP;
      const errorMessage = 'SMTP connection failed';
      const mockEntity = {
        id: 'test-id',
        recipient: 't***@example.com',
        purpose,
        success: false,
        errorMessage,
      } as EmailLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.logFailure(recipient, purpose, errorMessage);

      // Assert
      expect(mockRepository.create).toHaveBeenCalledWith({
        recipient: 'te***@example.com',
        purpose,
        success: false,
        errorMessage,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockEntity);
      expect(result).toEqual(mockEntity);
    });

    it('should log password reset email failure', async () => {
      // Arrange
      const recipient = 'user@example.com';
      const purpose = EMAIL_PURPOSES.PASSWORD_RESET;
      const errorMessage = 'Invalid email address';
      const mockEntity = {
        id: 'test-id',
        recipient: 'u***@example.com',
        purpose,
        success: false,
        errorMessage,
      } as EmailLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.logFailure(recipient, purpose, errorMessage);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe(errorMessage);
    });

    it('should log re-register email failure with network error', async () => {
      // Arrange
      const recipient = 'admin@example.com';
      const purpose = EMAIL_PURPOSES.RE_REGISTER;
      const errorMessage = 'Network timeout';
      const mockEntity = {
        id: 'test-id',
        recipient: 'adm***@example.com',
        purpose,
        success: false,
        errorMessage,
      } as EmailLog;

      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      // Act
      const result = await service.logFailure(recipient, purpose, errorMessage);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Network timeout');
    });
  });

  describe('maskEmail', () => {
    it('should mask short email correctly', async () => {
      // Arrange
      const email = 'a@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('*@example.com');
    });

    it('should mask medium length email correctly', async () => {
      // Arrange
      const email = 'test@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('te***@example.com');
    });

    it('should mask long email correctly', async () => {
      // Arrange
      const email = 'verylongemail@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('ver**********@example.com');
    });

    it('should show up to 3 characters for very long local part', async () => {
      // Arrange
      const email = 'extremelylongemailaddress@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      // length=25, visibleChars=min(ceil(25/3), 3)=min(9, 3)=3, mask=max(25-3, 3)=22
      expect(result).toBe('ext**********************@example.com');
      expect(result.split('@')[0].length).toBeGreaterThan(3);
    });

    it('should mask two-character local part', async () => {
      // Arrange
      const email = 'ab@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('a***@example.com');
    });

    it('should mask three-character local part', async () => {
      // Arrange
      const email = 'abc@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('a***@example.com');
    });

    it('should mask four-character local part', async () => {
      // Arrange
      const email = 'abcd@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('ab***@example.com');
    });

    it('should mask five-character local part', async () => {
      // Arrange
      const email = 'abcde@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('ab***@example.com');
    });

    it('should mask six-character local part', async () => {
      // Arrange
      const email = 'abcdef@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('ab****@example.com');
    });

    it('should return masked string when email is empty', async () => {
      // Arrange
      const email = '';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('***');
    });

    it('should return masked string when email has no @ symbol', async () => {
      // Arrange
      const email = 'notanemail';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('***');
    });

    it('should handle email with one character local part', async () => {
      // Arrange
      const email = 'x@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('*@example.com');
    });

    it('should handle email with empty local part', async () => {
      // Arrange
      const email = '@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      expect(result).toBe('*@example.com');
    });

    it('should preserve domain part unchanged', async () => {
      // Arrange
      const email = 'user@very.long.domain.example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      // length=4, visibleChars=min(ceil(4/3), 3)=2, mask=max(4-2, 3)=3
      expect(result).toBe('us***@very.long.domain.example.com');
    });

    it('should handle email with special characters in local part', async () => {
      // Arrange
      const email = 'user.name+tag@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      // length=13, visibleChars=min(ceil(13/3), 3)=3, mask=max(13-3, 3)=10
      expect(result).toBe('use**********@example.com');
    });

    it('should handle email with numbers in local part', async () => {
      // Arrange
      const email = 'user123@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      // length=7, visibleChars=min(ceil(7/3), 3)=3, mask=max(7-3, 3)=4
      expect(result).toBe('use****@example.com');
    });

    it('should ensure at least 3 asterisks in masked part', async () => {
      // Arrange
      const email = 'ab@example.com';

      // Act
      const result = service.maskEmail(email);

      // Assert
      const maskedPart = result.split('@')[0].replace(/[^*]/g, '');
      expect(maskedPart.length).toBeGreaterThanOrEqual(3);
    });
  });
});
