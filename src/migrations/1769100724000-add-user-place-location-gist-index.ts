import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPlaceLocationGistIndex1769100724000
  implements MigrationInterface
{
  name = 'AddUserPlaceLocationGistIndex1769100724000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing index if exists (created by TypeORM)
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_place_location;
    `);

    // Create GIST index for PostGIS spatial queries
    await queryRunner.query(`
      CREATE INDEX idx_user_place_location
      ON user_place
      USING GIST (location);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_place_location;
    `);
  }
}
