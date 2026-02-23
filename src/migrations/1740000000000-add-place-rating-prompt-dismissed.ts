import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlaceRatingPromptDismissed1740000000000
  implements MigrationInterface
{
  name = 'AddPlaceRatingPromptDismissed1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add promptDismissed column
    await queryRunner.query(`
      ALTER TABLE "place_rating"
      ADD COLUMN "promptDismissed" BOOLEAN NOT NULL DEFAULT false
    `);

    // Drop old index and recreate with promptDismissed
    await queryRunner.query(`
      DROP INDEX "idx_place_rating_user_pending"
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_place_rating_user_pending"
      ON "place_rating" ("userId", "rating", "skipped", "promptDismissed")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore old index
    await queryRunner.query(`
      DROP INDEX "idx_place_rating_user_pending"
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_place_rating_user_pending"
      ON "place_rating" ("userId", "rating", "skipped")
    `);

    // Remove column
    await queryRunner.query(`
      ALTER TABLE "place_rating" DROP COLUMN "promptDismissed"
    `);
  }
}
