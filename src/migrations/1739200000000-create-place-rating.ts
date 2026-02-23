import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlaceRating1739200000000 implements MigrationInterface {
  name = 'CreatePlaceRating1739200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create place_rating table
    await queryRunner.query(`
      CREATE TABLE "place_rating" (
        "id" SERIAL NOT NULL,
        "placeId" varchar(255) NOT NULL,
        "placeName" varchar(200) NOT NULL,
        "rating" int,
        "skipped" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" int NOT NULL,
        "placeRecommendationId" int,
        CONSTRAINT "PK_place_rating" PRIMARY KEY ("id")
      )
    `);

    // Foreign key: user
    await queryRunner.query(`
      ALTER TABLE "place_rating"
      ADD CONSTRAINT "FK_place_rating_user"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Foreign key: place_recommendation
    await queryRunner.query(`
      ALTER TABLE "place_rating"
      ADD CONSTRAINT "FK_place_rating_place_recommendation"
      FOREIGN KEY ("placeRecommendationId") REFERENCES "place_recommendation"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Index: pending rating lookup (user_id, rating, skipped)
    await queryRunner.query(`
      CREATE INDEX "idx_place_rating_user_pending"
      ON "place_rating" ("userId", "rating", "skipped")
    `);

    // Index: aggregate by place_id
    await queryRunner.query(`
      CREATE INDEX "idx_place_rating_place_id"
      ON "place_rating" ("placeId")
    `);

    // Add averageRating and ratingCount to user_place
    await queryRunner.query(`
      ALTER TABLE "user_place"
      ADD COLUMN "averageRating" decimal(2,1) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "user_place"
      ADD COLUMN "ratingCount" int NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns from user_place
    await queryRunner.query(`
      ALTER TABLE "user_place" DROP COLUMN "ratingCount"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_place" DROP COLUMN "averageRating"
    `);

    // Drop indexes
    await queryRunner.query(`DROP INDEX "idx_place_rating_place_id"`);
    await queryRunner.query(`DROP INDEX "idx_place_rating_user_pending"`);

    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE "place_rating" DROP CONSTRAINT "FK_place_rating_place_recommendation"
    `);
    await queryRunner.query(`
      ALTER TABLE "place_rating" DROP CONSTRAINT "FK_place_rating_user"
    `);

    // Drop table
    await queryRunner.query(`DROP TABLE "place_rating"`);
  }
}
