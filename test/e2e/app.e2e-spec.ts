import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createE2EApp, closeE2EApp } from './setup';
import { E2EAssertions } from '../utils/e2e-assertions';
import { TEST_TIMEOUTS } from '../constants/test.constants';

describe('Application (E2E smoke test)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  }, TEST_TIMEOUTS.E2E_DEFAULT_MS);

  afterAll(async () => {
    await closeE2EApp(app);
  });

  describe('GET /nonexistent', () => {
    it('should return 404 for an unknown route', async () => {
      const response = await supertest(app.getHttpServer()).get('/nonexistent');

      E2EAssertions.expectErrorResponse(response, 404);
    });
  });
});
