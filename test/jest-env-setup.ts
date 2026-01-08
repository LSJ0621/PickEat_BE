// Environment setup - runs BEFORE test framework
// This must run before any imports to set NODE_ENV and load .env.test
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set NODE_ENV first
process.env.NODE_ENV = 'test';

// Load .env.test file
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
