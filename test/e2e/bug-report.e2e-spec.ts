import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  createAuthenticatedAdmin,
  authenticatedRequest,
  type TestUser,
} from './setup';
import { TEST_TIMEOUTS } from '../constants/test.constants';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { BugReportStatus } from '@/bug-report/enum/bug-report-status.enum';
import { DiscordWebhookClient } from '@/external/discord/clients/discord-webhook.client';

describe('BugReport (e2e)', () => {
  let app: INestApplication;

  const api = () => supertest(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2EApp();
  }, TEST_TIMEOUTS.E2E_DEFAULT_MS);

  afterAll(async () => {
    await closeE2EApp(app);
  });

  beforeEach(async () => {
    await truncateAllTables(app);
    jest.restoreAllMocks();
  });

  // =====================
  // 버그 제보 (POST /bug-reports)
  // =====================
  describe('POST /bug-reports', () => {
    it('category, title, description이 유효하면 201 + id를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '화면이 깨집니다')
        .field('description', '특정 환경에서 레이아웃이 무너지는 현상이 발생합니다.');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('title이 30자를 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', 'a'.repeat(31))
        .field('description', '버그 설명입니다.');

      expect(res.status).toBe(400);
    });

    it('description이 500자를 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '버그 제목')
        .field('description', 'a'.repeat(501));

      expect(res.status).toBe(400);
    });

    it('이미지가 5장을 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      // 최소 유효 JPEG 바이너리 (1x1 픽셀)
      const minimalJpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
          'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAAREAABAAEDASIA' +
          'AhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAU' +
          'AQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A' +
          'IMAP/9k=',
        'base64',
      );
      const attachOpts = { filename: 'img.jpg', contentType: 'image/jpeg' };

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '버그 제목')
        .field('description', '버그 설명입니다.')
        .attach('images', minimalJpeg, attachOpts)
        .attach('images', minimalJpeg, attachOpts)
        .attach('images', minimalJpeg, attachOpts)
        .attach('images', minimalJpeg, attachOpts)
        .attach('images', minimalJpeg, attachOpts)
        .attach('images', minimalJpeg, attachOpts);

      expect(res.status).toBe(400);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api()
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '버그 제목')
        .field('description', '버그 설명입니다.');

      expect(res.status).toBe(401);
    });

    it('버그 리포트 생성 후 Discord sendMessage가 1회 호출된다', async () => {
      const discordClient = app.get(DiscordWebhookClient);
      const spy = jest.spyOn(discordClient, 'sendMessage');

      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '디스코드 알림 테스트')
        .field('description', '디스코드 알림이 전송되어야 합니다.');

      // fire-and-forget 방식으로 Discord 알림이 전송되므로 tick 대기
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Discord 알림 실패 시에도 버그 리포트가 저장된다', async () => {
      const discordClient = app.get(DiscordWebhookClient);
      jest
        .spyOn(discordClient, 'sendMessage')
        .mockRejectedValueOnce(new Error('Discord webhook failed'));

      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '디스코드 실패 테스트')
        .field('description', 'Discord 알림 실패에도 저장이 되어야 합니다.');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');

      // Verify the bug report was actually saved in the DB
      const bugReportRepo = app.get(DataSource).getRepository(BugReport);
      const saved = await bugReportRepo.findOne({
        where: { id: res.body.id },
      });
      expect(saved).not.toBeNull();
      expect(saved?.title).toBe('디스코드 실패 테스트');
    });
  });

  // =====================
  // 관리자 버그 관리 (GET /admin/bug-reports, PATCH /admin/bug-reports/:id/status)
  // =====================
  describe('Admin Bug Report Management', () => {
    let adminUser: TestUser;
    let bugReportId: number;

    /** 테스트용 버그 리포트를 일반 사용자로 생성한다 */
    async function seedBugReport(): Promise<number> {
      const testUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '관리자 테스트용 버그')
        .field('description', '관리자 테스트를 위한 버그 리포트입니다.');

      return res.body.id as number;
    }

    beforeEach(async () => {
      adminUser = await createAuthenticatedAdmin(app);
      bugReportId = await seedBugReport();
    });

    it('관리자가 조회하면 200 + 페이지네이션된 목록을 반환한다', async () => {
      const req = authenticatedRequest(app, adminUser.accessToken);

      const res = await req.get('/admin/bug-reports?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('pageInfo');
      expect(res.body.pageInfo).toHaveProperty('totalCount');
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('관리자가 상세 조회하면 200 + statusHistory 포함 상세 정보를 반환한다', async () => {
      const req = authenticatedRequest(app, adminUser.accessToken);

      const res = await req.get(`/admin/bug-reports/${bugReportId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', bugReportId);
      expect(res.body).toHaveProperty('statusHistory');
    });

    it('관리자가 상태 변경하면 200 + 변경된 상태를 반환한다', async () => {
      const req = authenticatedRequest(app, adminUser.accessToken);

      const res = await req
        .patch(`/admin/bug-reports/${bugReportId}/status`)
        .send({ status: BugReportStatus.CONFIRMED });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(BugReportStatus.CONFIRMED);
    });

    it('일반 사용자가 관리자 버그 리포트 엔드포인트에 접근하면 403 에러를 반환한다', async () => {
      const regularUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, regularUser.accessToken);

      const listRes = await req.get('/admin/bug-reports');
      expect(listRes.status).toBe(403);

      const detailRes = await req.get(`/admin/bug-reports/${bugReportId}`);
      expect(detailRes.status).toBe(403);

      const patchRes = await req
        .patch(`/admin/bug-reports/${bugReportId}/status`)
        .send({ status: BugReportStatus.CONFIRMED });
      expect(patchRes.status).toBe(403);
    });
  });
});
