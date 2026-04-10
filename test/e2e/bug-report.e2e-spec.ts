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
    it('should return 201 with id when category, title, description are valid', async () => {
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

    it('should return 400 when title exceeds 30 characters', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', 'a'.repeat(31))
        .field('description', '버그 설명입니다.');

      expect(res.status).toBe(400);
    });

    it('should return 400 when description exceeds 500 characters', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '버그 제목')
        .field('description', 'a'.repeat(501));

      expect(res.status).toBe(400);
    });

    it('should return 400 when more than 5 images are attached', async () => {
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

    it('should return 401 when request is made without authentication', async () => {
      const res = await api()
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '버그 제목')
        .field('description', '버그 설명입니다.');

      expect(res.status).toBe(401);
    });

    it('should call Discord sendMessage once after creating a bug report', async () => {
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

    it('should save bug report even when Discord notification fails', async () => {
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

    it('should return 200 with paginated list when admin queries bug reports', async () => {
      const req = authenticatedRequest(app, adminUser.accessToken);

      const res = await req.get('/admin/bug-reports?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('pageInfo');
      expect(res.body.pageInfo).toHaveProperty('totalCount');
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 200 with detail including status history when admin views a bug report', async () => {
      const req = authenticatedRequest(app, adminUser.accessToken);

      const res = await req.get(`/admin/bug-reports/${bugReportId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', bugReportId);
      expect(res.body).toHaveProperty('statusHistory');
    });

    it('should return 200 and update status when admin changes bug report status', async () => {
      const req = authenticatedRequest(app, adminUser.accessToken);

      const res = await req
        .patch(`/admin/bug-reports/${bugReportId}/status`)
        .send({ status: BugReportStatus.CONFIRMED });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(BugReportStatus.CONFIRMED);
    });

    it('should return 403 when a regular user tries to access admin bug report endpoints', async () => {
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
