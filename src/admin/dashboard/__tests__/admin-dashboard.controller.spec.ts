import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardController } from '../admin-dashboard.controller';
import { AdminDashboardService } from '../admin-dashboard.service';
import { TrendsQueryDto } from '../dto/trends-query.dto';
import { DashboardSummaryResponseDto } from '../dto/dashboard-summary.response.dto';
import { RecentActivitiesResponseDto } from '../dto/recent-activities.response.dto';
import { TrendsResponseDto } from '../dto/trends.response.dto';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let mockDashboardService: jest.Mocked<AdminDashboardService>;

  const mockSummary: DashboardSummaryResponseDto = {
    today: {
      newUsers: 5,
      menuRecommendations: 20,
      bugReports: 2,
    },
    total: {
      users: 1000,
      menuRecommendations: 5000,
      bugReports: 150,
    },
    pending: {
      unconfirmedBugReports: 10,
      urgentBugReports: 3,
    },
  };

  const mockRecentActivities: RecentActivitiesResponseDto = {
    recentUsers: [
      {
        id: 1,
        email: 'newuser@example.com',
        socialType: null,
        createdAt: '2024-01-15T12:00:00.000Z',
      },
    ],
    recentBugReports: [
      {
        id: 1,
        title: 'App crashes on startup',
        category: 'BUG',
        createdAt: '2024-01-14T10:00:00.000Z',
      },
    ],
    recentDeletedUsers: [
      {
        id: 5,
        email: 'deleted@example.com',
        deletedAt: '2024-01-13T09:00:00.000Z',
      },
    ],
  };

  beforeEach(async () => {
    mockDashboardService = {
      getSummary: jest.fn(),
      getRecentActivities: jest.fn(),
      getTrends: jest.fn(),
    } as unknown as jest.Mocked<AdminDashboardService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [
        { provide: AdminDashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    controller = module.get<AdminDashboardController>(AdminDashboardController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // getSummary
  // ─────────────────────────────────────────────
  describe('getSummary', () => {
    it('should return dashboard summary with today, total, and pending stats', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSummary();

      expect(mockDashboardService.getSummary).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockSummary);
      expect(result.today.newUsers).toBe(5);
      expect(result.total.users).toBe(1000);
      expect(result.pending.unconfirmedBugReports).toBe(10);
    });

    it('should propagate error when service throws', async () => {
      mockDashboardService.getSummary.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(controller.getSummary()).rejects.toThrow('Database error');
    });
  });

  // ─────────────────────────────────────────────
  // getRecentActivities
  // ─────────────────────────────────────────────
  describe('getRecentActivities', () => {
    it('should return recent users, bug reports, and deleted users', async () => {
      mockDashboardService.getRecentActivities.mockResolvedValue(
        mockRecentActivities,
      );

      const result = await controller.getRecentActivities();

      expect(mockDashboardService.getRecentActivities).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockRecentActivities);
      expect(result.recentUsers).toHaveLength(1);
      expect(result.recentBugReports).toHaveLength(1);
      expect(result.recentDeletedUsers).toHaveLength(1);
    });

    it('should return empty arrays when no recent activities exist', async () => {
      const emptyActivities: RecentActivitiesResponseDto = {
        recentUsers: [],
        recentBugReports: [],
        recentDeletedUsers: [],
      };
      mockDashboardService.getRecentActivities.mockResolvedValue(emptyActivities);

      const result = await controller.getRecentActivities();

      expect(result.recentUsers).toEqual([]);
      expect(result.recentBugReports).toEqual([]);
      expect(result.recentDeletedUsers).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // getTrends
  // ─────────────────────────────────────────────
  describe('getTrends', () => {
    it('should return trends data for all types with 7d period by default', async () => {
      const query: TrendsQueryDto = { period: '7d', type: 'all' };
      const expectedTrends: TrendsResponseDto = {
        users: [
          { date: '2024-01-08', count: 3 },
          { date: '2024-01-09', count: 5 },
        ],
        recommendations: [
          { date: '2024-01-08', count: 10 },
          { date: '2024-01-09', count: 15 },
        ],
      };

      mockDashboardService.getTrends.mockResolvedValue(expectedTrends);

      const result = await controller.getTrends(query);

      expect(mockDashboardService.getTrends).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedTrends);
      expect(result.users).toHaveLength(2);
      expect(result.recommendations).toHaveLength(2);
    });

    it('should return only user trends when type is users', async () => {
      const query: TrendsQueryDto = { period: '30d', type: 'users' };
      const expectedTrends: TrendsResponseDto = {
        users: [{ date: '2024-01-09', count: 7 }],
        recommendations: [],
      };

      mockDashboardService.getTrends.mockResolvedValue(expectedTrends);

      const result = await controller.getTrends(query);

      expect(mockDashboardService.getTrends).toHaveBeenCalledWith(query);
      expect(result.users).toHaveLength(1);
      expect(result.recommendations).toHaveLength(0);
    });

    it('should return only recommendation trends when type is recommendations', async () => {
      const query: TrendsQueryDto = { period: '90d', type: 'recommendations' };
      const expectedTrends: TrendsResponseDto = {
        users: [],
        recommendations: [{ date: '2024-01-09', count: 20 }],
      };

      mockDashboardService.getTrends.mockResolvedValue(expectedTrends);

      const result = await controller.getTrends(query);

      expect(mockDashboardService.getTrends).toHaveBeenCalledWith(query);
      expect(result.users).toHaveLength(0);
      expect(result.recommendations).toHaveLength(1);
    });

    it('should propagate error when service throws on trends query', async () => {
      const query: TrendsQueryDto = { period: '7d', type: 'all' };
      mockDashboardService.getTrends.mockRejectedValue(
        new Error('Trends query failed'),
      );

      await expect(controller.getTrends(query)).rejects.toThrow(
        'Trends query failed',
      );
    });
  });
});
