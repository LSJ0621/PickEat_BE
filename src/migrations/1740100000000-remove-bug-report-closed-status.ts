import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBugReportClosedStatus1740100000000
  implements MigrationInterface
{
  name = 'RemoveBugReportClosedStatus1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update existing CLOSED records to FIXED
    await queryRunner.query(`
      UPDATE "bug_report"
      SET "status" = 'FIXED'
      WHERE "status" = 'CLOSED'
    `);

    // Update status history records that reference CLOSED
    await queryRunner.query(`
      UPDATE "bug_report_status_history"
      SET "status" = 'FIXED'
      WHERE "status" = 'CLOSED'
    `);

    await queryRunner.query(`
      UPDATE "bug_report_status_history"
      SET "previousStatus" = 'FIXED'
      WHERE "previousStatus" = 'CLOSED'
    `);

    // Recreate the enum type without CLOSED
    await queryRunner.query(`
      ALTER TYPE "bug_report_status_enum"
      RENAME TO "bug_report_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "bug_report_status_enum"
      AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'FIXED')
    `);

    await queryRunner.query(`
      ALTER TABLE "bug_report"
      ALTER COLUMN "status" TYPE "bug_report_status_enum"
      USING "status"::text::"bug_report_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "bug_report_status_history"
      ALTER COLUMN "status" TYPE "bug_report_status_enum"
      USING "status"::text::"bug_report_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "bug_report_status_history"
      ALTER COLUMN "previousStatus" TYPE "bug_report_status_enum"
      USING "previousStatus"::text::"bug_report_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "bug_report_status_enum_old"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add CLOSED back to the enum
    await queryRunner.query(`
      ALTER TYPE "bug_report_status_enum"
      RENAME TO "bug_report_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "bug_report_status_enum"
      AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'FIXED', 'CLOSED')
    `);

    await queryRunner.query(`
      ALTER TABLE "bug_report"
      ALTER COLUMN "status" TYPE "bug_report_status_enum"
      USING "status"::text::"bug_report_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "bug_report_status_history"
      ALTER COLUMN "status" TYPE "bug_report_status_enum"
      USING "status"::text::"bug_report_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "bug_report_status_history"
      ALTER COLUMN "previousStatus" TYPE "bug_report_status_enum"
      USING "previousStatus"::text::"bug_report_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "bug_report_status_enum_old"
    `);
  }
}
