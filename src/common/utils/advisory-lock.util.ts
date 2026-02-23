import { DataSource } from 'typeorm';

/**
 * PostgreSQL Advisory Lock wrapper
 * Provides distributed locking mechanism using pg_try_advisory_lock
 *
 * @param dataSource - TypeORM DataSource
 * @param lockName - Lock name (will be hashed to integer)
 * @param fn - Function to execute under lock
 * @param options - Optional timeout configuration
 * @returns Object containing acquisition status, result, and timeout flag
 */
export async function withAdvisoryLock<T>(
  dataSource: DataSource,
  lockName: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<{ acquired: boolean; result?: T; timedOut?: boolean }> {
  const lockKey = hashStringToInt(lockName);
  const queryRunner = dataSource.createQueryRunner();

  await queryRunner.connect();

  try {
    const [{ pg_try_advisory_lock: acquired }] = await queryRunner.query(
      'SELECT pg_try_advisory_lock($1)',
      [lockKey],
    );

    if (!acquired) {
      return { acquired: false };
    }

    if (options?.timeoutMs) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Advisory lock timed out after ${options.timeoutMs}ms`,
                  ),
                ),
              options.timeoutMs,
            ),
          ),
        ]);
        return { acquired: true, result };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('Advisory lock timed out')
        ) {
          return { acquired: true, timedOut: true };
        }
        throw error;
      }
    }

    const result = await fn();
    return { acquired: true, result };
  } finally {
    await queryRunner.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    await queryRunner.release();
  }
}

/**
 * Hash string to 32-bit integer for PostgreSQL advisory lock
 * Uses simple hash algorithm to convert string to numeric key
 *
 * @param str - String to hash
 * @returns 32-bit integer hash
 */
function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
