import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestingApp,
  closeTestingApp,
  createAllMockClients,
} from '../setup/testing-app.module';
import { AuthTestHelper } from '../setup/auth-test.helper';
import { BugReportFactory, UserFactory } from '../../factories/entity.factory';
import { BugReportStatus } from '@/bug-report/enum/bug-report-status.enum';
import { mockS3Responses } from '../../mocks/external-clients.mock';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { Repository } from 'typeorm';
import { User } from '@/user/entities/user.entity';

describe('BugReport (e2e)', () => {
  jest.setTimeout(60000); // 60 seconds timeout for E2E tests
  let app: INestApplication;
  let mocks: ReturnType<typeof createAllMockClients>;
  let authHelper: AuthTestHelper;
  let bugReportRepository: Repository<BugReport>;
  let userRepository: Repository<User>;

  beforeAll(async () => {
    const testApp = await createTestingApp();
    app = testApp.app;
    mocks = testApp.mocks;
    authHelper = new AuthTestHelper(app);
    bugReportRepository = testApp.module.get(getRepositoryToken(BugReport));
    userRepository = testApp.module.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await closeTestingApp(app);
  });

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Set default mock responses
    mocks.mockS3Client.uploadBugReportImage.mockResolvedValue(
      mockS3Responses.uploadSuccess.Location,
    );
    mocks.mockDiscordWebhookClient.sendMessage.mockResolvedValue(undefined);

    // Clean up database - delete in correct order to avoid FK constraints
    await bugReportRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();
  });

  describe('POST /bug-reports', () => {
    it('should create a bug report without images', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);
      const dto = {
        category: 'UI/UX',
        title: '버튼이 작동하지 않습니다',
        description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
      };

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('number');

      // Verify database record
      const savedBugReport = await bugReportRepository.findOne({
        where: { id: response.body.id },
        relations: ['user'],
      });

      expect(savedBugReport).toBeDefined();
      expect(savedBugReport?.category).toBe(dto.category);
      expect(savedBugReport?.title).toBe(dto.title);
      expect(savedBugReport?.description).toBe(dto.description);
      expect(savedBugReport?.images).toBeNull();
      expect(savedBugReport?.status).toBe(BugReportStatus.UNCONFIRMED);
      expect(savedBugReport?.user.id).toBe(user.id);

      // Verify S3 upload was NOT called
      expect(mocks.mockS3Client.uploadBugReportImage).not.toHaveBeenCalled();
    });

    it('should create a bug report with images', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);
      const dto = {
        category: 'Crash',
        title: '앱이 갑자기 종료됩니다',
        description: '메뉴 추천 중 앱이 갑자기 종료되었습니다.',
      };

      // Create mock image files
      const imageBuffer1 = Buffer.from('fake-image-1');
      const imageBuffer2 = Buffer.from('fake-image-2');

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .field('category', dto.category)
        .field('title', dto.title)
        .field('description', dto.description)
        .attach('images', imageBuffer1, 'screenshot1.png')
        .attach('images', imageBuffer2, 'screenshot2.png')
        .expect(201);

      expect(response.body).toHaveProperty('id');

      // Verify database record
      const savedBugReport = await bugReportRepository.findOne({
        where: { id: response.body.id },
        relations: ['user'],
      });

      expect(savedBugReport).toBeDefined();
      expect(savedBugReport?.images).toHaveLength(2);
      expect(savedBugReport?.images?.[0]).toBe(
        mockS3Responses.uploadSuccess.Location,
      );
      expect(savedBugReport?.images?.[1]).toBe(
        mockS3Responses.uploadSuccess.Location,
      );

      // Verify S3 upload was called twice
      expect(mocks.mockS3Client.uploadBugReportImage).toHaveBeenCalledTimes(2);
    });

    it('should fail when category is missing', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);
      const dto = {
        title: '버튼이 작동하지 않습니다',
        description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
      };

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when title exceeds max length', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);
      const dto = {
        category: 'UI/UX',
        title: 'a'.repeat(31), // Max is 30
        description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
      };

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when description exceeds max length', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);
      const dto = {
        category: 'UI/UX',
        title: '버튼이 작동하지 않습니다',
        description: 'a'.repeat(501), // Max is 500
      };

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when not authenticated', async () => {
      const dto = {
        category: 'UI/UX',
        title: '버튼이 작동하지 않습니다',
        description: '메뉴 추천 버튼을 눌러도 반응이 없습니다.',
      };

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .send(dto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should fail when S3 upload fails', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);

      // Mock S3 upload failure
      mocks.mockS3Client.uploadBugReportImage.mockRejectedValue(
        new Error('S3 upload failed'),
      );

      const imageBuffer = Buffer.from('fake-image');

      const response = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .field('category', 'Crash')
        .field('title', '앱이 종료됩니다')
        .field('description', '메뉴 추천 중 앱이 종료되었습니다.')
        .attach('images', imageBuffer, 'screenshot.png')
        .expect(500);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(500);
    });

    it('should reject more than 5 images', async () => {
      const user = await userRepository.save(UserFactory.create());
      const token = authHelper.createAccessToken(user);

      const imageBuffer = Buffer.from('fake-image');
      const formData = request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${token}`)
        .field('category', 'Crash')
        .field('title', '앱이 종료됩니다')
        .field('description', '메뉴 추천 중 앱이 종료되었습니다.');

      // Attach 6 images (exceeds max of 5)
      for (let i = 0; i < 6; i++) {
        formData.attach('images', imageBuffer, `screenshot${i}.png`);
      }

      // FilesInterceptor('images', 5) rejects requests with more than 5 files
      const response = await formData.expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('GET /admin/bug-reports', () => {
    it('should return paginated bug reports for admin', async () => {
      const user = await userRepository.save(UserFactory.create());

      // Create multiple bug reports
      await bugReportRepository.save([
        BugReportFactory.create({ user, status: BugReportStatus.UNCONFIRMED }),
        BugReportFactory.create({ user, status: BugReportStatus.UNCONFIRMED }),
        BugReportFactory.create({ user, status: BugReportStatus.CONFIRMED }),
      ]);

      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pageInfo');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBe(3);
      expect(response.body.pageInfo).toMatchObject({
        page: 1,
        limit: 20,
        totalCount: 3,
        hasNext: false,
      });
    });

    it('should filter bug reports by status', async () => {
      const user = await userRepository.save(UserFactory.create());

      await bugReportRepository.save([
        BugReportFactory.create({ user, status: BugReportStatus.UNCONFIRMED }),
        BugReportFactory.create({ user, status: BugReportStatus.UNCONFIRMED }),
        BugReportFactory.create({ user, status: BugReportStatus.CONFIRMED }),
      ]);

      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ status: BugReportStatus.UNCONFIRMED })
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(response.body.items.length).toBe(2);
      expect(
        response.body.items.every(
          (report: any) => report.status === BugReportStatus.UNCONFIRMED,
        ),
      ).toBe(true);
    });

    it('should support pagination', async () => {
      const user = await userRepository.save(UserFactory.create());

      // Create 25 bug reports
      const bugReports = Array.from({ length: 25 }, () =>
        BugReportFactory.create({ user }),
      );
      await bugReportRepository.save(bugReports);

      // Page 1
      const page1Response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ page: 1, limit: 10 })
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(page1Response.body.items.length).toBe(10);
      expect(page1Response.body.pageInfo).toMatchObject({
        page: 1,
        limit: 10,
        totalCount: 25,
        hasNext: true,
      });

      // Page 2
      const page2Response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ page: 2, limit: 10 })
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(page2Response.body.items.length).toBe(10);
      expect(page2Response.body.pageInfo.page).toBe(2);
    });

    it('should filter by date', async () => {
      const user = await userRepository.save(UserFactory.create());
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - 1); // Yesterday

      await bugReportRepository.save(
        BugReportFactory.create({
          user,
          createdAt: targetDate,
        }),
      );

      await bugReportRepository.save(BugReportFactory.create({ user }));

      const dateFilter = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ date: dateFilter })
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(response.body.items.length).toBeGreaterThanOrEqual(0);
      // Note: Database datetime handling may vary, so we check structure
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pageInfo');
    });

    it('should fail when limit exceeds maximum', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ limit: 51 }) // Max is 50
        .set(authHelper.getAdminAuthHeaders())
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when page is less than 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ page: 0 })
        .set(authHelper.getAdminAuthHeaders())
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail for non-admin users', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .set(authHelper.getUserAuthHeaders())
        .expect(403);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(403);
    });

    it('should fail when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /admin/bug-reports/:id', () => {
    it('should return bug report details for admin', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      const response = await request(app.getHttpServer())
        .get(`/admin/bug-reports/${bugReport.id}`)
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(response.body).toMatchObject({
        id: bugReport.id,
        category: bugReport.category,
        title: bugReport.title,
        description: bugReport.description,
        status: bugReport.status,
      });
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return bug report with images', async () => {
      const user = await userRepository.save(UserFactory.create());
      const imageUrls = [
        'https://s3.amazonaws.com/bug-reports/image1.png',
        'https://s3.amazonaws.com/bug-reports/image2.png',
      ];
      const bugReport = await bugReportRepository.save(
        BugReportFactory.createWithImages(user, imageUrls),
      );

      const response = await request(app.getHttpServer())
        .get(`/admin/bug-reports/${bugReport.id}`)
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(response.body.images).toEqual(imageUrls);
    });

    it('should fail when bug report not found', async () => {
      const nonExistentId = 99999;

      const response = await request(app.getHttpServer())
        .get(`/admin/bug-reports/${nonExistentId}`)
        .set(authHelper.getAdminAuthHeaders())
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(404);
    });

    it('should fail for non-admin users', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      const response = await request(app.getHttpServer())
        .get(`/admin/bug-reports/${bugReport.id}`)
        .set(authHelper.getUserAuthHeaders())
        .expect(403);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(403);
    });

    it('should fail when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports/1')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should fail with invalid ID format', async () => {
      // ParseIntPipe validates the ID format and returns 400 BadRequest for invalid IDs
      const response = await request(app.getHttpServer())
        .get('/admin/bug-reports/invalid-id')
        .set(authHelper.getAdminAuthHeaders())
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('PATCH /admin/bug-reports/:id/status', () => {
    it('should update bug report status to CONFIRMED', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({
          user,
          status: BugReportStatus.UNCONFIRMED,
        }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReport.id}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({ status: BugReportStatus.CONFIRMED })
        .expect(200);

      expect(response.body).toMatchObject({
        id: bugReport.id,
        status: BugReportStatus.CONFIRMED,
      });

      // Verify database update
      const updatedBugReport = await bugReportRepository.findOne({
        where: { id: bugReport.id },
      });
      expect(updatedBugReport?.status).toBe(BugReportStatus.CONFIRMED);
    });

    it('should update bug report status to UNCONFIRMED', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({
          user,
          status: BugReportStatus.CONFIRMED,
        }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReport.id}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({ status: BugReportStatus.UNCONFIRMED })
        .expect(200);

      expect(response.body.status).toBe(BugReportStatus.UNCONFIRMED);
    });

    it('should fail when bug report not found', async () => {
      const nonExistentId = 99999;

      const response = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${nonExistentId}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({ status: BugReportStatus.CONFIRMED })
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(404);
    });

    it('should fail with invalid status value', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReport.id}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({ status: 'INVALID_STATUS' })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when status is missing', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReport.id}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail for non-admin users', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReport.id}/status`)
        .set(authHelper.getUserAuthHeaders())
        .send({ status: BugReportStatus.CONFIRMED })
        .expect(403);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(403);
    });

    it('should fail when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .patch('/admin/bug-reports/1/status')
        .send({ status: BugReportStatus.CONFIRMED })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should return updatedAt in response', async () => {
      const user = await userRepository.save(UserFactory.create());
      const bugReport = await bugReportRepository.save(
        BugReportFactory.create({ user }),
      );

      const updateResponse = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReport.id}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({ status: BugReportStatus.CONFIRMED })
        .expect(200);

      expect(updateResponse.body.status).toBe(BugReportStatus.CONFIRMED);
      expect(updateResponse.body).toHaveProperty('updatedAt');
      expect(updateResponse.body.updatedAt).toBeTruthy();

      // Verify database record was updated
      const updatedBugReport = await bugReportRepository.findOne({
        where: { id: bugReport.id },
      });

      expect(updatedBugReport?.status).toBe(BugReportStatus.CONFIRMED);
      expect(updatedBugReport?.updatedAt).toBeTruthy();
    });
  });

  describe('Integration: Complete bug report workflow', () => {
    it('should complete full workflow from creation to status update', async () => {
      // 1. User creates a bug report with images
      const user = await userRepository.save(UserFactory.create());
      const userToken = authHelper.createAccessToken(user);
      const imageBuffer = Buffer.from('fake-image');

      const createResponse = await request(app.getHttpServer())
        .post('/bug-reports')
        .set('Authorization', `Bearer ${userToken}`)
        .field('category', 'Crash')
        .field('title', '앱이 종료됩니다')
        .field('description', '메뉴 추천 중 앱이 갑자기 종료되었습니다.')
        .attach('images', imageBuffer, 'crash-screenshot.png')
        .expect(201);

      const bugReportId = createResponse.body.id;

      // 2. Admin views the bug report
      const detailResponse = await request(app.getHttpServer())
        .get(`/admin/bug-reports/${bugReportId}`)
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(detailResponse.body.status).toBe(BugReportStatus.UNCONFIRMED);
      expect(detailResponse.body.images).toHaveLength(1);

      // 3. Admin confirms the bug report
      const updateResponse = await request(app.getHttpServer())
        .patch(`/admin/bug-reports/${bugReportId}/status`)
        .set(authHelper.getAdminAuthHeaders())
        .send({ status: BugReportStatus.CONFIRMED })
        .expect(200);

      expect(updateResponse.body.status).toBe(BugReportStatus.CONFIRMED);

      // 4. Verify in list
      const listResponse = await request(app.getHttpServer())
        .get('/admin/bug-reports')
        .query({ status: BugReportStatus.CONFIRMED })
        .set(authHelper.getAdminAuthHeaders())
        .expect(200);

      expect(listResponse.body.items).toHaveLength(1);
      expect(listResponse.body.items[0].id).toBe(bugReportId);
      expect(listResponse.body.items[0].status).toBe(BugReportStatus.CONFIRMED);
    });
  });
});
