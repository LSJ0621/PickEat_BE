# Menu Recommendation Integration Tests

## Overview

This directory contains integration tests for the Menu recommendation system, testing the complete flow of services working together.

## Database Limitation

**IMPORTANT**: The integration tests in this file require PostgreSQL due to the use of PostgreSQL-specific `ENUM` types in entities (specifically `MenuSelectionStatus` enum in `MenuSelection` entity).

SQLite in-memory database does not support native ENUM types, which causes test failures.

## Running Integration Tests

### Option 1: Use Docker PostgreSQL (Recommended)

```bash
# Start PostgreSQL via Docker
docker-compose up -d postgres

# Run integration tests against PostgreSQL
NODE_ENV=test DATABASE_URL="postgresql://user:password@localhost:5432/pickeat_test" pnpm jest --config=test/jest-integration.json test/integration/menu/

# Clean up
docker-compose down
```

### Option 2: Use E2E Test Approach

The E2E tests in `/test/e2e/menu/menu.e2e-spec.ts` already provide comprehensive integration testing with the full AppModule loaded, which includes proper PostgreSQL configuration.

```bash
# Run E2E tests (includes menu integration scenarios)
pnpm run test:e2e test/e2e/menu/menu.e2e-spec.ts
```

## Test Coverage

The integration test suite covers:

1. **Menu Recommendation Flow**
   - Two-stage AI recommendation (GPT-4o-mini validation → GPT-5.1 recommendation)
   - User preference integration
   - Invalid request rejection
   - Database persistence

2. **Place Recommendation Flow**
   - Google Places API integration
   - AI-powered restaurant ranking
   - Duplicate prevention
   - Error handling

3. **Menu Selection Flow**
   - Selection creation from recommendations
   - History retrieval with date filtering
   - Status management

4. **Complete User Journey**
   - End-to-end flow from menu request to place recommendation
   - Data persistence across all related entities

## Future Improvements

To enable SQLite-based integration tests:

1. Create SQLite-compatible entity variants
2. Use repository mocks instead of real database
3. Switch to PostgreSQL for all test environments
