import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Import all entities for PostgreSQL test database
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';
import { EmailVerification } from '@/auth/entities/email-verification.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { BugReportNotification } from '@/bug-report/entities/bug-report-notification.entity';

/**
 * All entities used in the application
 */
export const ALL_ENTITIES = [
  User,
  UserAddress,
  MenuRecommendation,
  MenuSelection,
  PlaceRecommendation,
  EmailVerification,
  BugReport,
  BugReportNotification,
];

/**
 * PostgreSQL TypeORM configuration for E2E tests
 * Uses Docker postgres-test container on port 5433
 */
export const testDatabaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'pick-eat_test',
  entities: ALL_ENTITIES,
  synchronize: true, // Auto-create schema in test environment
  dropSchema: true, // Drop schema before each test run
  logging: false, // Disable SQL logging in tests
};

/**
 * Creates a fresh test DataSource for integration tests
 */
export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'pick-eat_test',
    entities: ALL_ENTITIES,
    synchronize: true,
    dropSchema: true,
    logging: false,
  });

  await dataSource.initialize();
  return dataSource;
}

/**
 * Resets the database before app initialization
 * This must be called BEFORE NestJS app initialization to prevent
 * AdminInitializerService from failing due to duplicate admin user
 */
export async function resetDatabaseBeforeAppInit(): Promise<void> {
  const tempDataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'pick-eat_test',
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });

  try {
    await tempDataSource.initialize();
    await cleanDatabase(tempDataSource);
  } finally {
    if (tempDataSource.isInitialized) {
      await tempDataSource.destroy();
    }
  }
}

/**
 * Cleans all tables in the database
 * Use this between tests to ensure isolation
 */
export async function cleanDatabase(dataSource: DataSource): Promise<void> {
  // For PostgreSQL, we need to use query builder to delete all rows
  // Sort entities by dependency order (children first, then parents)
  const entities = dataSource.entityMetadatas;

  // Define deletion order based on foreign key dependencies
  // Delete child tables before parent tables to avoid FK constraint violations
  const deletionOrder = [
    'PlaceRecommendation', // References MenuRecommendation
    'MenuSelection', // References User and MenuRecommendation
    'MenuRecommendation', // References User
    'BugReportNotification', // Standalone (no FK)
    'BugReport', // References User
    'EmailVerification', // Standalone (no FK)
    'UserAddress', // References User
    'User', // Parent table (referenced by multiple tables)
  ];

  for (const entityName of deletionOrder) {
    const entity = entities.find((e) => e.name === entityName);
    if (entity) {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(entity.name)
        .execute();
    }
  }

  // Clean any remaining entities not in the deletionOrder
  for (const entity of entities) {
    if (!deletionOrder.includes(entity.name)) {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(entity.name)
        .execute();
    }
  }
}

/**
 * Destroys the test DataSource
 */
export async function destroyTestDataSource(
  dataSource: DataSource,
): Promise<void> {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}

/**
 * Test database setup hook for Jest
 * Use in setupFilesAfterEnv or beforeAll/afterAll hooks
 */
export class TestDatabaseSetup {
  private static dataSource: DataSource | null = null;

  static async initialize(): Promise<DataSource> {
    if (!this.dataSource) {
      this.dataSource = await createTestDataSource();
    }
    return this.dataSource;
  }

  static async cleanup(): Promise<void> {
    if (this.dataSource) {
      await cleanDatabase(this.dataSource);
    }
  }

  static async destroy(): Promise<void> {
    if (this.dataSource) {
      await destroyTestDataSource(this.dataSource);
      this.dataSource = null;
    }
  }

  static getDataSource(): DataSource | null {
    return this.dataSource;
  }
}

// Global setup for E2E tests
process.env.NODE_ENV = 'test';
