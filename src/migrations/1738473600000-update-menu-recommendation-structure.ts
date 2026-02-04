import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateMenuRecommendationStructure1738473600000
  implements MigrationInterface
{
  name = 'UpdateMenuRecommendationStructure1738473600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns for structured response format
    await queryRunner.query(`
      ALTER TABLE menu_recommendation
      ADD COLUMN IF NOT EXISTS intro TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS closing TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS "recommendationDetails" jsonb;
    `);

    // Rename reason column to intro (migrate existing data)
    await queryRunner.query(`
      UPDATE menu_recommendation
      SET intro = COALESCE(reason, '')
      WHERE intro = '' OR intro IS NULL;
    `);

    // Drop the old reason column
    await queryRunner.query(`
      ALTER TABLE menu_recommendation
      DROP COLUMN IF EXISTS reason;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore reason column
    await queryRunner.query(`
      ALTER TABLE menu_recommendation
      ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';
    `);

    // Migrate intro back to reason
    await queryRunner.query(`
      UPDATE menu_recommendation
      SET reason = COALESCE(intro, '')
      WHERE reason = '' OR reason IS NULL;
    `);

    // Drop new columns
    await queryRunner.query(`
      ALTER TABLE menu_recommendation
      DROP COLUMN IF EXISTS intro,
      DROP COLUMN IF EXISTS closing,
      DROP COLUMN IF EXISTS "recommendationDetails";
    `);
  }
}
