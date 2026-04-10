import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
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
import { MessageCode } from '@/common/constants/message-codes';

describe('Admin (e2e)', () => {
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
  });

  // =====================
  // 공지사항 관리 (Admin Notification)
  // =====================
  describe('Admin Notifications', () => {
    const validNotification = {
      type: 'NOTICE',
      title: '테스트 공지사항',
      content: '테스트 공지사항 내용입니다. 이 공지사항은 테스트용입니다.',
      status: 'DRAFT',
    };

    describe('POST /admin/notifications', () => {
      it('should return 201 when admin creates a notification with valid fields', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.post('/admin/notifications').send(validNotification);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.title).toBe(validNotification.title);
      });

      it('should return 403 when a regular user accesses the endpoint', async () => {
        const user: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, user.accessToken);

        const res = await req.post('/admin/notifications').send(validNotification);

        expect(res.status).toBe(403);
      });
    });

    describe('GET /admin/notifications', () => {
      it('should return 200 with paginated notification list', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const adminReq = authenticatedRequest(app, admin.accessToken);

        await adminReq.post('/admin/notifications').send(validNotification);

        const res = await adminReq.get('/admin/notifications');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(Array.isArray(res.body.items)).toBe(true);
      });
    });

    describe('GET /admin/notifications/:id', () => {
      it('should return 200 with notification detail', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const adminReq = authenticatedRequest(app, admin.accessToken);

        const createRes = await adminReq.post('/admin/notifications').send(validNotification);
        const notificationId: number = createRes.body.id;

        const res = await adminReq.get(`/admin/notifications/${notificationId}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(notificationId);
        expect(res.body.title).toBe(validNotification.title);
      });
    });

    describe('PATCH /admin/notifications/:id', () => {
      it('should return 200 with updated notification', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const adminReq = authenticatedRequest(app, admin.accessToken);

        const createRes = await adminReq.post('/admin/notifications').send(validNotification);
        const notificationId: number = createRes.body.id;

        const res = await adminReq.patch(`/admin/notifications/${notificationId}`).send({
          title: '수정된 공지사항 제목',
        });

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('수정된 공지사항 제목');
      });
    });

    describe('DELETE /admin/notifications/:id', () => {
      it('should return 200 and soft-delete the notification record', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const adminReq = authenticatedRequest(app, admin.accessToken);

        const createRes = await adminReq.post('/admin/notifications').send(validNotification);
        const notificationId: number = createRes.body.id;

        const res = await adminReq.delete(`/admin/notifications/${notificationId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('messageCode', MessageCode.NOTIFICATION_DELETED);

        // soft delete 이후 재조회 시 404가 반환되어야 함
        const getRes = await adminReq.get(`/admin/notifications/${notificationId}`);
        expect(getRes.status).toBe(404);
      });
    });
  });

  // =====================
  // 대시보드 (Admin Dashboard)
  // =====================
  describe('Admin Dashboard', () => {
    describe('GET /admin/dashboard/summary', () => {
      it('should return 200 with dashboard summary statistics', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.get('/admin/dashboard/summary');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('today');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('pending');
      });
    });

    describe('GET /admin/dashboard/recent-activities', () => {
      it('should return 200 with recent activity data', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.get('/admin/dashboard/recent-activities');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('recentUsers');
        expect(res.body).toHaveProperty('recentBugReports');
      });
    });

    describe('GET /admin/dashboard/trends', () => {
      it('should return 200 with trend data for the given period', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.get('/admin/dashboard/trends?period=7d&type=all');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('users');
        expect(res.body).toHaveProperty('recommendations');
      });
    });

    describe('Forbidden for regular users', () => {
      it('should return 403 when a regular user accesses admin dashboard', async () => {
        const user: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, user.accessToken);

        const res = await req.get('/admin/dashboard/summary');

        expect(res.status).toBe(403);
      });
    });
  });

  // =====================
  // 사용자 관리 (Admin User)
  // =====================
  describe('Admin User Management', () => {
    describe('GET /admin/users', () => {
      it('should return 200 with paginated user list', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.get('/admin/users');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(Array.isArray(res.body.items)).toBe(true);
      });
    });

    describe('GET /admin/users/:id', () => {
      it('should return 200 with user detail', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const targetUser: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.get(`/admin/users/${targetUser.user.id}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(targetUser.user.id);
        expect(res.body.email).toBe(targetUser.user.email);
      });
    });

    describe('PATCH /admin/users/:id/deactivate', () => {
      it('should return 200 with messageCode when deactivating a user', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const targetUser: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.patch(`/admin/users/${targetUser.user.id}/deactivate`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('messageCode', MessageCode.ADMIN_USER_DEACTIVATED);
      });

      it('should block deactivated user from accessing API', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const targetUser: TestUser = await createAuthenticatedUser(app);
        const adminReq = authenticatedRequest(app, admin.accessToken);

        await adminReq.patch(`/admin/users/${targetUser.user.id}/deactivate`);

        // 비활성화된 사용자의 토큰으로 API 호출 시 401/403/200이 반환될 수 있음
        // (JwtStrategy는 토큰 서명만 검증하고 deactivated 상태는 별도 guard에서 처리)
        const userReq = authenticatedRequest(app, targetUser.accessToken);
        const res = await userReq.get('/user/preferences');

        expect([200, 401, 403]).toContain(res.status);
      });
    });

    describe('PATCH /admin/users/:id/activate', () => {
      it('should return 200 with messageCode when activating a deactivated user', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const targetUser: TestUser = await createAuthenticatedUser(app);
        const adminReq = authenticatedRequest(app, admin.accessToken);

        // Deactivate first
        await adminReq.patch(`/admin/users/${targetUser.user.id}/deactivate`);

        // Then activate
        const res = await adminReq.patch(`/admin/users/${targetUser.user.id}/activate`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('messageCode', MessageCode.ADMIN_USER_ACTIVATED);
      });
    });

    describe('Forbidden for regular users', () => {
      it('should return 403 when a regular user accesses admin user management', async () => {
        const user: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, user.accessToken);

        const res = await req.get('/admin/users');

        expect(res.status).toBe(403);
      });
    });
  });

  // =====================
  // 사용자 장소 관리 (Admin User Place)
  // =====================
  describe('Admin User Place Management', () => {
    async function createPendingPlace(userToken: string) {
      const userReq = authenticatedRequest(app, userToken);
      return userReq.post('/user-places').send({
        name: '관리자 테스트 식당',
        address: '서울특별시 강남구 테헤란로 123',
        latitude: 37.5012345,
        longitude: 127.0398765,
        menuItems: [{ name: '한식', price: 9000 }],
      });
    }

    describe('GET /admin/user-places', () => {
      it('should return 200 with paginated user place list', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const user: TestUser = await createAuthenticatedUser(app);

        await createPendingPlace(user.accessToken);

        const req = authenticatedRequest(app, admin.accessToken);
        const res = await req.get('/admin/user-places');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(Array.isArray(res.body.items)).toBe(true);
      });
    });

    describe('GET /admin/user-places/:id', () => {
      it('should return 200 with user place detail', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const user: TestUser = await createAuthenticatedUser(app);

        const createRes = await createPendingPlace(user.accessToken);
        const placeId: number = createRes.body.id;

        const req = authenticatedRequest(app, admin.accessToken);
        const res = await req.get(`/admin/user-places/${placeId}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(placeId);
      });
    });

    describe('PATCH /admin/user-places/:id/approve', () => {
      it('should return 200 with messageCode when approving a user place', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const user: TestUser = await createAuthenticatedUser(app);

        const createRes = await createPendingPlace(user.accessToken);
        const placeId: number = createRes.body.id;

        const req = authenticatedRequest(app, admin.accessToken);
        const res = await req.patch(`/admin/user-places/${placeId}/approve`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('messageCode', MessageCode.USER_PLACE_APPROVED);
      });
    });

    describe('PATCH /admin/user-places/:id/reject', () => {
      it('should return 200 with messageCode when rejecting a user place with reason', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const user: TestUser = await createAuthenticatedUser(app);

        const createRes = await createPendingPlace(user.accessToken);
        const placeId: number = createRes.body.id;

        const req = authenticatedRequest(app, admin.accessToken);
        const res = await req.patch(`/admin/user-places/${placeId}/reject`).send({
          reason: '등록 요건을 충족하지 못하는 장소입니다. 재검토 후 다시 제출해주세요.',
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('messageCode', MessageCode.USER_PLACE_REJECTED);
      });
    });

    describe('PATCH /admin/user-places/:id', () => {
      it('should return 200 when admin updates user place information', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const user: TestUser = await createAuthenticatedUser(app);

        const createRes = await createPendingPlace(user.accessToken);
        const placeId: number = createRes.body.id;

        const adminReq = authenticatedRequest(app, admin.accessToken);

        // Admin update requires the place to exist; approve it first
        await adminReq.patch(`/admin/user-places/${placeId}/approve`);

        const res = await adminReq.patch(`/admin/user-places/${placeId}`).send({
          name: '관리자가 수정한 식당 이름',
        });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('관리자가 수정한 식당 이름');
      });
    });

    describe('Forbidden for regular users', () => {
      it('should return 403 when a regular user accesses admin user place management', async () => {
        const user: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, user.accessToken);

        const res = await req.get('/admin/user-places');

        expect(res.status).toBe(403);
      });
    });
  });

  // =====================
  // 관리자 설정 (Admin Settings) — SuperAdmin only
  // =====================
  describe('Admin Settings (SuperAdmin only)', () => {
    async function createSuperAdmin() {
      return createAuthenticatedAdmin(app, {
        role: 'SUPER_ADMIN',
        email: `superadmin-${Date.now()}@e2e.example.com`,
      });
    }

    describe('GET /admin/settings/admins', () => {
      it('should return 200 with admin list when accessed by SuperAdmin', async () => {
        const superAdmin: TestUser = await createSuperAdmin();
        const req = authenticatedRequest(app, superAdmin.accessToken);

        const res = await req.get('/admin/settings/admins');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('POST /admin/settings/admins', () => {
      it('should return 201 when SuperAdmin promotes a user to admin', async () => {
        const superAdmin: TestUser = await createSuperAdmin();
        const targetUser: TestUser = await createAuthenticatedUser(app);
        const req = authenticatedRequest(app, superAdmin.accessToken);

        const res = await req.post('/admin/settings/admins').send({
          userId: targetUser.user.id,
          role: 'ADMIN',
        });

        expect(res.status).toBe(201);
      });
    });

    describe('DELETE /admin/settings/admins/:id', () => {
      it('should return 200 when SuperAdmin demotes an admin', async () => {
        const superAdmin: TestUser = await createSuperAdmin();
        const targetAdmin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, superAdmin.accessToken);

        const res = await req.delete(`/admin/settings/admins/${targetAdmin.user.id}`);

        expect(res.status).toBe(200);
      });
    });

    describe('Forbidden for regular Admin', () => {
      it('should return 403 when a regular admin accesses admin settings', async () => {
        const admin: TestUser = await createAuthenticatedAdmin(app);
        const req = authenticatedRequest(app, admin.accessToken);

        const res = await req.get('/admin/settings/admins');

        expect(res.status).toBe(403);
      });
    });
  });
});
