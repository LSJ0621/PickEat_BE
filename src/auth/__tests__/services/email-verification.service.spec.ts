import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EmailVerificationService } from '../../services/email-verification.service';
import { EmailVerification } from '../../entities/email-verification.entity';
import { EmailPurpose } from '../../dto/send-email-code.dto';
import { ErrorCode } from '@/common/constants/error-codes';

type MockRepo = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  softDelete: jest.Mock;
};

type MockUserService = {
  findByEmailWithSelect: jest.Mock;
};

type MockNotification = {
  ensureMailConfig: jest.Mock;
  sendVerificationEmail: jest.Mock;
};

function createService(): {
  service: EmailVerificationService;
  repo: MockRepo;
  userService: MockUserService;
  notification: MockNotification;
} {
  const repo: MockRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((r: unknown) => Promise.resolve(r)),
    create: jest.fn().mockImplementation((r: unknown) => r),
    softDelete: jest.fn(),
  };
  const userService: MockUserService = {
    findByEmailWithSelect: jest.fn().mockResolvedValue(null),
  };
  const notification: MockNotification = {
    ensureMailConfig: jest.fn(),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const service = new EmailVerificationService(
    repo as unknown as never,
    userService as unknown as never,
    notification as unknown as never,
  );
  return { service, repo, userService, notification };
}

describe('EmailVerificationService', () => {
  describe('sendCode — 정상 발송', () => {
    it('SIGNUP purpose + 기존 코드 없음 → 신규 레코드 생성 + remainCount 반환', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);

      const result = await service.sendCode('new@test.com', EmailPurpose.SIGNUP);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@test.com',
          sendCount: 1,
          status: 'ACTIVE',
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(result.remainCount).toBe(4);
    });

    it('기존 코드가 만료된 상태(어제) → 신규 레코드 경로로 재생성', async () => {
      const { service, repo } = createService();
      const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
      repo.findOne.mockResolvedValue({
        id: 1,
        email: 'old@test.com',
        purpose: EmailPurpose.SIGNUP,
        status: 'EXPIRED',
        sendCount: 2,
        failCount: 0,
        createdAt: yesterday,
        updatedAt: yesterday,
        lastSentAt: yesterday,
      } as unknown as EmailVerification);

      const result = await service.sendCode('old@test.com', EmailPurpose.SIGNUP);

      // 같은 날이 아니므로 새 레코드 경로(create 호출)
      expect(repo.create).toHaveBeenCalled();
      expect(result.remainCount).toBe(4);
    });
  });

  describe('sendCode — 에러/제한', () => {
    it('재발송 쿨다운 이내 재요청 → BadRequestException', async () => {
      const { service, repo } = createService();
      const now = new Date();
      repo.findOne.mockResolvedValue({
        id: 1,
        email: 't@t.com',
        purpose: EmailPurpose.SIGNUP,
        status: 'ACTIVE',
        sendCount: 1,
        failCount: 0,
        createdAt: now,
        updatedAt: now,
        lastSentAt: now,
      } as unknown as EmailVerification);

      await expect(
        service.sendCode('t@t.com', EmailPurpose.SIGNUP),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('verifyCode', () => {
    it('올바른 코드 → status=USED 로 저장', async () => {
      const { service, repo } = createService();
      const plainCode = '999111';
      const codeHash = await bcrypt.hash(plainCode, 10);
      const record = {
        id: 1,
        email: 'v@t.com',
        purpose: EmailPurpose.SIGNUP,
        status: 'ACTIVE',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        failCount: 0,
        used: false,
        usedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as EmailVerification;
      repo.findOne.mockResolvedValue(record);

      await service.verifyCode('v@t.com', plainCode, EmailPurpose.SIGNUP);

      expect(record.status).toBe('USED');
      expect(record.used).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(record);
    });

    it('잘못된 코드 → BadRequestException (AUTH_VERIFICATION_CODE_INVALID)', async () => {
      const { service, repo } = createService();
      const codeHash = await bcrypt.hash('111111', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        email: 'v@t.com',
        purpose: EmailPurpose.SIGNUP,
        status: 'ACTIVE',
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
        failCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as EmailVerification);

      await expect(
        service.verifyCode('v@t.com', '222222', EmailPurpose.SIGNUP),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALID },
      });
    });

    it('만료된 코드 → BadRequestException (AUTH_VERIFICATION_CODE_EXPIRED)', async () => {
      const { service, repo } = createService();
      const codeHash = await bcrypt.hash('111111', 10);
      repo.findOne.mockResolvedValue({
        id: 1,
        email: 'v@t.com',
        purpose: EmailPurpose.SIGNUP,
        status: 'ACTIVE',
        codeHash,
        expiresAt: new Date(Date.now() - 1000),
        failCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as EmailVerification);

      await expect(
        service.verifyCode('v@t.com', '111111', EmailPurpose.SIGNUP),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.AUTH_VERIFICATION_CODE_EXPIRED },
      });
    });

    it('존재하지 않는 레코드 → BadRequestException (AUTH_VERIFICATION_CODE_INVALID)', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyCode('x@t.com', '987321', EmailPurpose.SIGNUP),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.AUTH_VERIFICATION_CODE_INVALID },
      });
    });
  });
});
