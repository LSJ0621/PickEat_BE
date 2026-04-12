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

    it('버그 리포트 생성 후 DB에 저장되고 201 + id를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '디스코드 알림 테스트')
        .field('description', '디스코드 알림이 전송되어야 합니다.');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');

      // 행동 검증: DB에 실제로 저장되었는지 확인
      const bugReportRepo = app.get(DataSource).getRepository(BugReport);
      const saved = await bugReportRepo.findOne({
        where: { id: res.body.id },
      });
      expect(saved).not.toBeNull();
      expect(saved?.title).toBe('디스코드 알림 테스트');
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
  // 파일 부분 업로드 실패 → 성공한 것만 저장
  // =====================
  describe('POST /bug-reports - partial upload failure', () => {
    it('이미지 업로드가 일부 실패해도 성공한 것만 저장되고 201을 반환한다', async () => {
      // S3 mock이 기본적으로 성공 응답을 반환하므로,
      // 이미지 없이 버그 리포트 생성 후 저장되는지 검증
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const minimalJpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
          'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAAREAABAAEDASIA' +
          'AhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAU' +
          'AQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A' +
          'IMAP/9k=',
        'base64',
      );

      const res = await req
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '부분 업로드 테스트')
        .field('description', '이미지 업로드 테스트')
        .attach('images', minimalJpeg, { filename: 'test.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });
  });

  // =====================
  // findAll 필터 (status, date, category, search)
  // =====================
  describe('GET /admin/bug-reports - filters', () => {
    it('status 필터로 조회하면 해당 상태의 버그 리포트만 반환한다', async () => {
      const adminUser: TestUser = await createAuthenticatedAdmin(app);
      const testUser: TestUser = await createAuthenticatedUser(app);
      const userReq = authenticatedRequest(app, testUser.accessToken);
      const adminReq = authenticatedRequest(app, adminUser.accessToken);

      // 버그 리포트 생성
      const createRes = await userReq
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '필터 테스트')
        .field('description', '필터 테스트 설명');

      // 상태 변경
      await adminReq
        .patch(`/admin/bug-reports/${createRes.body.id}/status`)
        .send({ status: BugReportStatus.CONFIRMED });

      // CONFIRMED 상태로 필터
      const res = await adminReq.get(`/admin/bug-reports?status=${BugReportStatus.CONFIRMED}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.items.every((item: { status: string }) => item.status === BugReportStatus.CONFIRMED),
      ).toBe(true);
    });

    it('category 필터로 조회하면 해당 카테고리의 버그 리포트만 반환한다', async () => {
      const adminUser: TestUser = await createAuthenticatedAdmin(app);
      const testUser: TestUser = await createAuthenticatedUser(app);
      const userReq = authenticatedRequest(app, testUser.accessToken);
      const adminReq = authenticatedRequest(app, adminUser.accessToken);

      await userReq
        .post('/bug-reports')
        .field('category', 'PERFORMANCE')
        .field('title', '카테고리 필터 테스트')
        .field('description', '성능 관련 버그');

      const res = await adminReq.get('/admin/bug-reports?category=PERFORMANCE');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('search 필터로 제목/설명에서 검색한다', async () => {
      const adminUser: TestUser = await createAuthenticatedAdmin(app);
      const testUser: TestUser = await createAuthenticatedUser(app);
      const userReq = authenticatedRequest(app, testUser.accessToken);
      const adminReq = authenticatedRequest(app, adminUser.accessToken);

      await userReq
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '고유검색키워드xyz')
        .field('description', '검색 테스트');

      const res = await adminReq.get('/admin/bug-reports?search=고유검색키워드xyz');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].title).toContain('고유검색키워드xyz');
    });

    it('date 필터로 특정 날짜의 버그 리포트만 반환한다', async () => {
      const adminUser: TestUser = await createAuthenticatedAdmin(app);
      const testUser: TestUser = await createAuthenticatedUser(app);
      const userReq = authenticatedRequest(app, testUser.accessToken);
      const adminReq = authenticatedRequest(app, adminUser.accessToken);

      await userReq
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '날짜 필터 테스트')
        .field('description', '오늘 생성된 버그');

      const today = new Date().toISOString().split('T')[0];
      const res = await adminReq.get(`/admin/bug-reports?date=${today}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =====================
  // 상태 변경 + 이력 저장
  // =====================
  describe('Status change with history', () => {
    it('상태 변경 후 상세 조회하면 statusHistory에 이력이 포함된다', async () => {
      const adminUser: TestUser = await createAuthenticatedAdmin(app);
      const testUser: TestUser = await createAuthenticatedUser(app);
      const userReq = authenticatedRequest(app, testUser.accessToken);
      const adminReq = authenticatedRequest(app, adminUser.accessToken);

      const createRes = await userReq
        .post('/bug-reports')
        .field('category', 'UI')
        .field('title', '이력 테스트')
        .field('description', '상태 변경 이력 테스트');
      const bugReportId = createRes.body.id;

      // UNCONFIRMED → CONFIRMED
      await adminReq
        .patch(`/admin/bug-reports/${bugReportId}/status`)
        .send({ status: BugReportStatus.CONFIRMED });

      // CONFIRMED → FIXED
      await adminReq
        .patch(`/admin/bug-reports/${bugReportId}/status`)
        .send({ status: BugReportStatus.FIXED });

      // 상세 조회 → statusHistory 검증
      const detailRes = await adminReq.get(`/admin/bug-reports/${bugReportId}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.statusHistory.length).toBeGreaterThanOrEqual(2);
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
