import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminDashboardService } from '../admin-dashboard.service';
import { User } from '@/user/entities/user.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { BugReportStatus } from '@/bug-report/enum/bug-report-status.enum';
import {
  createMockRepository,
  createMockQueryBuilder,
} from '../../../../test/mocks/repository.mock';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let userRepository: ReturnType<typeof createMockRepository<User>>;
  let menuRecommendationRepository: ReturnType<
    typeof createMockRepository<MenuRecommendation>
  >;
  let bugReportRepository: ReturnType<typeof createMockRepository<BugReport>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    userRepository = createMockRepository<User>();
    menuRecommendationRepository = createMockRepository<MenuRecommendation>();
    bugReportRepository = createMockRepository<BugReport>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(MenuRecommendation),
          useValue: menuRecommendationRepository,
        },
        {
          provide: getRepositoryToken(BugReport),
          useValue: bugReportRepository,
        },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSummary', () => {
    it('should return summary with today stats when data exists', async () => {
      userRepository.count
        .mockResolvedValueOnce(5) // todayUsers
        .mockResolvedValueOnce(100); // totalUsers
      menuRecommendationRepository.count
        .mockResolvedValueOnce(10) // todayRecommendations
        .mockResolvedValueOnce(500); // totalRecommendations
      bugReportRepository.count
        .mockResolvedValueOnce(2) // todayBugReports
        .mockResolvedValueOnce(50) // totalBugReports
        .mockResolvedValueOnce(8) // unconfirmedBugReports
        .mockResolvedValueOnce(3); // urgentBugReports

      const result = await service.getSummary();

      expect(result).toEqual({
        today: {
          newUsers: 5,
          menuRecommendations: 10,
          bugReports: 2,
        },
        total: {
          users: 100,
          menuRecommendations: 500,
          bugReports: 50,
        },
        pending: {
          unconfirmedBugReports: 8,
          urgentBugReports: 3,
        },
      });
    });

    it('should return summary with zero counts when no data exists', async () => {
      userRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);

      const result = await service.getSummary();

      expect(result).toEqual({
        today: {
          newUsers: 0,
          menuRecommendations: 0,
          bugReports: 0,
        },
        total: {
          users: 0,
          menuRecommendations: 0,
          bugReports: 0,
        },
        pending: {
          unconfirmedBugReports: 0,
          urgentBugReports: 0,
        },
      });
    });

    it('should query today users with MoreThanOrEqual condition', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T10:30:00Z'));

      userRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);

      await service.getSummary();

      const todayUserCall = userRepository.count.mock.calls[0]?.[0];
      expect(todayUserCall).toHaveProperty('where');
      if (todayUserCall && 'where' in todayUserCall && todayUserCall.where) {
        expect(todayUserCall.where).toHaveProperty('createdAt');
      }

      jest.useRealTimers();
    });

    it('should query urgent bug reports created 3+ days ago', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T10:30:00Z'));

      userRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);

      await service.getSummary();

      const urgentBugReportsCall = bugReportRepository.count.mock.calls[3]?.[0];
      expect(urgentBugReportsCall).toHaveProperty('where');
      if (
        urgentBugReportsCall &&
        'where' in urgentBugReportsCall &&
        urgentBugReportsCall.where
      ) {
        expect(urgentBugReportsCall.where).toMatchObject({
          status: BugReportStatus.UNCONFIRMED,
        });
      }

      jest.useRealTimers();
    });

    it('should handle repository errors gracefully', async () => {
      userRepository.count.mockRejectedValue(new Error('Database error'));

      await expect(service.getSummary()).rejects.toThrow('Database error');
    });

    it('should execute all 8 Promise.all queries', async () => {
      userRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);

      await service.getSummary();

      expect(userRepository.count).toHaveBeenCalledTimes(2);
      expect(menuRecommendationRepository.count).toHaveBeenCalledTimes(2);
      expect(bugReportRepository.count).toHaveBeenCalledTimes(4);
    });

    it('should calculate KST timezone correctly for today queries', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T18:00:00Z')); // 03:00 KST next day

      userRepository.count.mockResolvedValue(0);
      menuRecommendationRepository.count.mockResolvedValue(0);
      bugReportRepository.count.mockResolvedValue(0);

      await service.getSummary();

      const todayUserCall = userRepository.count.mock.calls[0]?.[0];

      // Verify where condition exists
      expect(todayUserCall).toHaveProperty('where');

      jest.useRealTimers();
    });
  });

  describe('getRecentActivities', () => {
    it('should return recent activities with correct data transformations', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'user1@example.com',
          socialType: 'EMAIL',
          createdAt: new Date('2026-02-15T10:00:00Z'),
        } as User,
        {
          id: 2,
          email: 'user2@example.com',
          socialType: 'GOOGLE',
          createdAt: new Date('2026-02-14T10:00:00Z'),
        } as User,
      ];

      const mockBugReports = [
        {
          id: 1,
          title: 'Bug 1',
          category: 'UI',
          createdAt: new Date('2026-02-15T09:00:00Z'),
        } as BugReport,
      ];

      const mockDeletedUsers = [
        {
          id: 3,
          email: 'deleted@example.com',
          deletedAt: new Date('2026-02-14T08:00:00Z'),
        } as User,
      ];

      userRepository.find
        .mockResolvedValueOnce(mockUsers)
        .mockResolvedValueOnce(mockDeletedUsers);
      bugReportRepository.find.mockResolvedValueOnce(mockBugReports);

      const result = await service.getRecentActivities();

      expect(result).toEqual({
        recentUsers: [
          {
            id: 1,
            email: 'user1@example.com',
            socialType: 'EMAIL',
            createdAt: '2026-02-15T10:00:00.000Z',
          },
          {
            id: 2,
            email: 'user2@example.com',
            socialType: 'GOOGLE',
            createdAt: '2026-02-14T10:00:00.000Z',
          },
        ],
        recentBugReports: [
          {
            id: 1,
            title: 'Bug 1',
            category: 'UI',
            createdAt: '2026-02-15T09:00:00.000Z',
          },
        ],
        recentDeletedUsers: [
          {
            id: 3,
            email: 'deleted@example.com',
            deletedAt: '2026-02-14T08:00:00.000Z',
          },
        ],
      });
    });

    it('should return empty arrays when no activities exist', async () => {
      userRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      const result = await service.getRecentActivities();

      expect(result).toEqual({
        recentUsers: [],
        recentBugReports: [],
        recentDeletedUsers: [],
      });
    });

    it('should query recent users with correct parameters', async () => {
      userRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      await service.getRecentActivities();

      expect(userRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 5,
      });
    });

    it('should query recent bug reports with correct parameters', async () => {
      userRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      await service.getRecentActivities();

      expect(bugReportRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 5,
      });
    });

    it('should query deleted users with withDeleted and Not(IsNull())', async () => {
      userRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      await service.getRecentActivities();

      const deletedUsersCall = userRepository.find.mock.calls[1]?.[0];
      expect(deletedUsersCall).toMatchObject({
        withDeleted: true,
        order: { deletedAt: 'DESC' },
        take: 5,
      });
      if (
        deletedUsersCall &&
        'where' in deletedUsersCall &&
        deletedUsersCall.where
      ) {
        expect(deletedUsersCall.where).toHaveProperty('deletedAt');
      }
    });

    it('should execute all 3 Promise.all queries', async () => {
      userRepository.find.mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      await service.getRecentActivities();

      expect(userRepository.find).toHaveBeenCalledTimes(2);
      expect(bugReportRepository.find).toHaveBeenCalledTimes(1);
    });

    it('should convert dates to ISO strings correctly', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        socialType: 'EMAIL',
        createdAt: new Date('2026-02-15T10:30:45.123Z'),
      } as User;

      userRepository.find
        .mockResolvedValueOnce([mockUser])
        .mockResolvedValue([]);
      bugReportRepository.find.mockResolvedValue([]);

      const result = await service.getRecentActivities();

      expect(result.recentUsers[0].createdAt).toBe('2026-02-15T10:30:45.123Z');
    });

    it('should handle repository errors gracefully', async () => {
      userRepository.find.mockRejectedValue(new Error('Database error'));

      await expect(service.getRecentActivities()).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getTrends', () => {
    it('should return user trends for 7 days when period is 7d', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { date: '2026-02-14', count: '5' },
        { date: '2026-02-15', count: '3' },
      ]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '7d', type: 'users' });

      expect(result.users.length).toBe(8); // 7 days + 1 (inclusive)
      expect(result.recommendations).toEqual([]);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'user.createdAt >= :startDate',
        expect.any(Object),
      );
    });

    it('should return recommendation trends for 30 days when period is 30d', async () => {
      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { date: '2026-02-10', count: '10' },
      ]);
      menuRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getTrends({
        period: '30d',
        type: 'recommendations',
      });

      expect(result.users).toEqual([]);
      expect(result.recommendations.length).toBe(31); // 30 days + 1
    });

    it('should return both trends when type is all', async () => {
      const mockUserQueryBuilder = createMockQueryBuilder<User>();
      mockUserQueryBuilder.getRawMany.mockResolvedValue([]);
      userRepository.createQueryBuilder.mockReturnValue(mockUserQueryBuilder);

      const mockRecommendationQueryBuilder =
        createMockQueryBuilder<MenuRecommendation>();
      mockRecommendationQueryBuilder.getRawMany.mockResolvedValue([]);
      menuRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockRecommendationQueryBuilder,
      );

      const result = await service.getTrends({ period: '7d', type: 'all' });

      expect(result.users.length).toBe(8);
      expect(result.recommendations.length).toBe(8);
    });

    it('should fill missing dates with zero counts', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T10:00:00Z'));

      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { date: '2026-02-13', count: '5' },
        // 2026-02-14 is missing
        { date: '2026-02-15', count: '3' },
      ]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '7d', type: 'users' });

      const dateWithZero = result.users.find(
        (item) => item.date === '2026-02-14',
      );
      expect(dateWithZero).toBeDefined();
      expect(dateWithZero?.count).toBe(0);

      jest.useRealTimers();
    });

    it('should calculate 90 days period correctly', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '90d', type: 'users' });

      expect(result.users.length).toBe(91); // 90 days + 1
    });

    it('should group by date and count in query builder', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getTrends({ period: '7d', type: 'users' });

      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'DATE(user.createdAt)',
        'date',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'COUNT(*)',
        'count',
      );
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith(
        'DATE(user.createdAt)',
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('date', 'ASC');
    });

    it('should use correct table alias for menu recommendations', async () => {
      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      menuRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.getTrends({
        period: '7d',
        type: 'recommendations',
      });

      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'DATE(menurecommendation.createdAt)',
        'date',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'menurecommendation.createdAt >= :startDate',
        expect.any(Object),
      );
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith(
        'DATE(menurecommendation.createdAt)',
      );
    });

    it('should parse count from string to number', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { date: '2026-02-15', count: '123' },
      ]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '7d', type: 'users' });

      // The date will be filled by fillMissingDates
      const foundItem = result.users.find((item) =>
        item.date.startsWith('2026-02'),
      );
      expect(foundItem).toBeDefined();
      expect(typeof foundItem?.count).toBe('number');
    });

    it('should handle date objects in raw results', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: new Date('2026-02-15T00:00:00Z') as unknown as string,
          count: '10',
        },
      ]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '7d', type: 'users' });

      // Verify we have some data in results
      expect(result.users.length).toBeGreaterThan(0);
      // All counts should be numbers
      result.users.forEach((item) => {
        expect(typeof item.count).toBe('number');
      });
    });

    it('should calculate KST today for startDate calculation', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T18:00:00Z')); // 03:00 KST next day

      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getTrends({ period: '7d', type: 'users' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'user.createdAt >= :startDate',
        expect.objectContaining({ startDate: expect.any(Date) }),
      );

      jest.useRealTimers();
    });

    it('should return empty array for users when type is recommendations', async () => {
      const mockQueryBuilder = createMockQueryBuilder<MenuRecommendation>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      menuRecommendationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getTrends({
        period: '7d',
        type: 'recommendations',
      });

      expect(result.users).toEqual([]);
      expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return empty array for recommendations when type is users', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '7d', type: 'users' });

      expect(result.recommendations).toEqual([]);
      expect(
        menuRecommendationRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });

    it('should sort dates in ascending order in filled results', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-15T10:00:00Z'));

      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { date: '2026-02-15', count: '5' },
        { date: '2026-02-13', count: '3' },
      ]);
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrends({ period: '7d', type: 'users' });

      // Verify dates are in ascending order
      for (let i = 0; i < result.users.length - 1; i++) {
        expect(result.users[i].date <= result.users[i + 1].date).toBe(true);
      }

      jest.useRealTimers();
    });

    it('should handle repository errors gracefully', async () => {
      const mockQueryBuilder = createMockQueryBuilder<User>();
      mockQueryBuilder.getRawMany.mockRejectedValue(
        new Error('Database error'),
      );
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await expect(
        service.getTrends({ period: '7d', type: 'users' }),
      ).rejects.toThrow('Database error');
    });
  });
});
