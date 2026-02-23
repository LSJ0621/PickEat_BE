import { Logger } from '@nestjs/common';
import { streamingAsyncLocalStorage } from './retry-context';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableStatusCodes?: number[];
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 1,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  retryableStatusCodes: [429, 500, 503],
};

/**
 * Exponential backoff retry utility for external API calls
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @param logger - Optional logger for retry attempts
 * @returns Result of the async function
 */
export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  logger?: Logger,
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const context = streamingAsyncLocalStorage.getStore();
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Check if client disconnected before each attempt
    if (context?.signal?.aborted) {
      throw new Error('Request aborted by client');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Abort errors should not be retried
      if (isAbortError(error)) {
        throw error;
      }

      // Check if error is retryable
      const isRetryable = isRetryableError(error, config.retryableStatusCodes);

      // Don't retry on last attempt or non-retryable errors
      if (attempt === config.maxRetries || !isRetryable) {
        break;
      }

      // Notify retry callback (from options or streaming context)
      const onRetryCallback = config.onRetry ?? context?.onRetry;
      if (onRetryCallback) {
        onRetryCallback(attempt + 1, error);
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelayMs * Math.pow(config.backoffFactor, attempt),
        config.maxDelayMs,
      );

      if (logger) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn(
          `Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms. Error: ${errorMessage}`,
        );
      }

      // Check if client disconnected before waiting
      if (context?.signal?.aborted) {
        throw new Error('Request aborted by client');
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  throw lastError;
}

/**
 * Check if error is an abort error (client disconnected)
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.includes('signal is aborted') ||
      error.message === 'Request aborted by client'
    );
  }
  return false;
}

/**
 * Check if error is retryable based on status code
 */
function isRetryableError(
  error: unknown,
  retryableStatusCodes: number[],
): boolean {
  if (typeof error === 'object' && error !== null) {
    // Axios error structure
    if ('response' in error) {
      const axiosError = error as { response?: { status?: number } };
      const status = axiosError.response?.status;
      if (status && retryableStatusCodes.includes(status)) {
        return true;
      }
    }

    // OpenAI error structure
    if ('status' in error) {
      const openAiError = error as { status?: number };
      const status = openAiError.status;
      if (status && retryableStatusCodes.includes(status)) {
        return true;
      }
    }
  }

  return false;
}
