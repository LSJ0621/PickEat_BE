import { INestApplication } from '@nestjs/common';
import { DataSource, EntityTarget, ObjectType } from 'typeorm';

/**
 * Truncates every table registered in the DataSource's entity metadata.
 * Uses TRUNCATE … RESTART IDENTITY CASCADE to clear all rows and reset
 * auto-increment sequences.
 *
 * Intended for use in `beforeEach` / `afterEach` hooks when full isolation
 * between test cases is required.
 */
export async function truncateAllTables(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const entityMetadatas = dataSource.entityMetadatas;

  for (const metadata of entityMetadatas) {
    const repository = dataSource.getRepository(metadata.name);
    await repository.query(
      `TRUNCATE TABLE "${metadata.tableName}" RESTART IDENTITY CASCADE`,
    );
  }
}

/**
 * Truncates only the tables that correspond to the given entity classes.
 * Uses TRUNCATE … RESTART IDENTITY CASCADE.
 *
 * Prefer this over `truncateAllTables` when a test only touches a small
 * number of entities and full truncation would be too slow.
 *
 * @param app - The initialized NestJS application instance
 * @param entityClasses - One or more TypeORM entity classes to truncate
 */
export async function truncateTables(
  app: INestApplication,
  ...entityClasses: EntityTarget<ObjectType<unknown>>[]
): Promise<void> {
  const dataSource = app.get(DataSource);

  for (const entityClass of entityClasses) {
    const metadata = dataSource.getMetadata(entityClass);
    await dataSource.query(
      `TRUNCATE TABLE "${metadata.tableName}" RESTART IDENTITY CASCADE`,
    );
  }
}
