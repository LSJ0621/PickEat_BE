import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMenuSelectionVersion1739300000000
  implements MigrationInterface
{
  name = 'AddMenuSelectionVersion1739300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "menu_selection"
      ADD COLUMN "version" int NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "menu_selection" DROP COLUMN "version"
    `);
  }
}
