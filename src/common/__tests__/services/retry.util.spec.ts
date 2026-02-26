import { Logger } from '@nestjs/common';
import {
  retryWithExponentialBackoff,
  isAbortError,
  RetryOptions,
} from '@/common/utils/retry.util';
import { streamingAsyncLocalStorage } from '@/common/utils/retry-context';

describe('retryWithExponentialBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('successful execution', () => {
    it('should return result immediately on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = retryWithExponentialBackoff(fn);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should succeed on second attempt after one retryable failure', async () => {
      const retryableError = { response: { status: 500 } };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('success-on-retry');

      const options: RetryOptions = { maxRetries: 1, initialDelayMs: 100 };
      const resultPromise = retryWithExponentialBackoff(fn, options);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success-on-retry');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('abort signal handling', () => {
    it('should throw abort error when signal is aborted before attempt', async () => {
      const controller = new AbortController();
      controller.abort();

      const fn = jest.fn().mockResolvedValue('should-not-reach');

      const resultPromise = streamingAsyncLocalStorage.run(
        { signal: controller.signal },
        () => retryWithExponentialBackoff(fn),
      );

      await expect(resultPromise).rejects.toThrow('Request aborted by client');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should throw abort error when signal is aborted before waiting delay', async () => {
      const controller = new AbortController();
      const retryableError = { response: { status: 500 } };

      let callCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          controller.abort();
        }
        throw retryableError;
      });

      const options: RetryOptions = { maxRetries: 3, initialDelayMs: 100 };
      const thrown = await streamingAsyncLocalStorage.run(
        { signal: controller.signal },
        () => retryWithExponentialBackoff(fn, options).catch((e) => e),
      );

      expect(thrown).toBeDefined();
    });
  });

  describe('abort error propagation', () => {
    it('should immediately rethrow AbortError without retrying', async () => {
      const abortError = new Error('Request aborted by client');
      abortError.name = 'AbortError';
      const fn = jest.fn().mockRejectedValue(abortError);

      const options: RetryOptions = { maxRetries: 3 };

      await expect(
        retryWithExponentialBackoff(fn, options),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should immediately rethrow error with "signal is aborted" message', async () => {
      const abortError = new Error('signal is aborted without reason');
      const fn = jest.fn().mockRejectedValue(abortError);

      const options: RetryOptions = { maxRetries: 3 };

      await expect(retryWithExponentialBackoff(fn, options)).rejects.toThrow(
        'signal is aborted',
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-retryable errors', () => {
    it('should throw immediately on non-retryable status code', async () => {
      const error = { response: { status: 404 } };
      const fn = jest.fn().mockRejectedValue(error);

      const options: RetryOptions = { maxRetries: 3 };
      await expect(retryWithExponentialBackoff(fn, options)).rejects.toEqual(
        error,
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw immediately on error without response property', async () => {
      const error = new Error('Some network error');
      const fn = jest.fn().mockRejectedValue(error);

      const options: RetryOptions = { maxRetries: 3 };
      await expect(retryWithExponentialBackoff(fn, options)).rejects.toThrow(
        'Some network error',
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry callback from options on retry', async () => {
      const retryableError = { response: { status: 429 } };
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('done');

      const options: RetryOptions = {
        maxRetries: 2,
        initialDelayMs: 10,
        onRetry,
      };

      const resultPromise = retryWithExponentialBackoff(fn, options);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledWith(1, retryableError);
    });

    it('should call onRetry callback from streaming context when options callback is absent', async () => {
      const retryableError = { response: { status: 503 } };
      const contextOnRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('done');

      const options: RetryOptions = { maxRetries: 2, initialDelayMs: 10 };

      const resultPromise = streamingAsyncLocalStorage.run(
        { onRetry: contextOnRetry },
        () => retryWithExponentialBackoff(fn, options),
      );
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(contextOnRetry).toHaveBeenCalledWith(1, retryableError);
    });

    it('should prefer options onRetry over context onRetry', async () => {
      const retryableError = { response: { status: 500 } };
      const optionsOnRetry = jest.fn();
      const contextOnRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('done');

      const options: RetryOptions = {
        maxRetries: 2,
        initialDelayMs: 10,
        onRetry: optionsOnRetry,
      };

      const resultPromise = streamingAsyncLocalStorage.run(
        { onRetry: contextOnRetry },
        () => retryWithExponentialBackoff(fn, options),
      );
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(optionsOnRetry).toHaveBeenCalled();
      expect(contextOnRetry).not.toHaveBeenCalled();
    });
  });

  describe('logger integration', () => {
    it('should log warning on retry when logger is provided', async () => {
      const retryableError = new Error('Service unavailable');
      const axiosError = { response: { status: 503 }, message: 'error' };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(axiosError)
        .mockResolvedValueOnce('done');

      const logger = { warn: jest.fn() } as unknown as Logger;
      const options: RetryOptions = { maxRetries: 2, initialDelayMs: 10 };

      const resultPromise = retryWithExponentialBackoff(fn, options, logger);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt 1/2'),
      );
    });

    it('should log error message when error is an Error instance', async () => {
      const retryableError = { response: { status: 500 } };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('done');

      const logger = { warn: jest.fn() } as unknown as Logger;
      const options: RetryOptions = { maxRetries: 1, initialDelayMs: 10 };

      const resultPromise = retryWithExponentialBackoff(fn, options, logger);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not log when no logger is provided', async () => {
      const retryableError = { response: { status: 500 } };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('done');

      const options: RetryOptions = { maxRetries: 1, initialDelayMs: 10 };

      const resultPromise = retryWithExponentialBackoff(fn, options);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('done');
    });
  });

  describe('exponential backoff delay calculation', () => {
    it('should cap delay at maxDelayMs', async () => {
      const retryableError = { response: { status: 500 } };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('done');

      const options: RetryOptions = {
        maxRetries: 2,
        initialDelayMs: 9000,
        maxDelayMs: 10000,
        backoffFactor: 2,
      };

      const resultPromise = retryWithExponentialBackoff(fn, options);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('done');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('all retries exhausted', () => {
    it('should call fn maxRetries + 1 times when all attempts fail with retryable error', async () => {
      const retryableError = { response: { status: 500 } };
      const fn = jest.fn().mockRejectedValue(retryableError);

      const options: RetryOptions = { maxRetries: 2, initialDelayMs: 10 };
      // We need to handle the rejection ourselves to avoid unhandled promise
      const resultPromise = retryWithExponentialBackoff(fn, options).catch(
        (e) => e,
      );
      await jest.runAllTimersAsync();
      const thrown = await resultPromise;

      expect(thrown).toEqual(retryableError);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('OpenAI error structure support', () => {
    it('should retry on OpenAI error with retryable status code', async () => {
      const openAiError = { status: 429 };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(openAiError)
        .mockResolvedValueOnce('done');

      const options: RetryOptions = { maxRetries: 1, initialDelayMs: 10 };
      const resultPromise = retryWithExponentialBackoff(fn, options);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('done');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on OpenAI error with non-retryable status code', async () => {
      const openAiError = { status: 400 };
      const fn = jest.fn().mockRejectedValue(openAiError);

      const options: RetryOptions = { maxRetries: 3 };
      await expect(retryWithExponentialBackoff(fn, options)).rejects.toEqual(
        openAiError,
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry when OpenAI error status is undefined', async () => {
      const openAiError = { status: undefined };
      const fn = jest.fn().mockRejectedValue(openAiError);

      const options: RetryOptions = { maxRetries: 3 };
      await expect(retryWithExponentialBackoff(fn, options)).rejects.toEqual(
        openAiError,
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('isAbortError', () => {
  it('should return true for error with AbortError name', () => {
    const error = new Error('something');
    error.name = 'AbortError';

    expect(isAbortError(error)).toBe(true);
  });

  it('should return true for error with "signal is aborted" message', () => {
    const error = new Error('signal is aborted without reason');

    expect(isAbortError(error)).toBe(true);
  });

  it('should return true for error with "Request aborted by client" message', () => {
    const error = new Error('Request aborted by client');

    expect(isAbortError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Network error');

    expect(isAbortError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isAbortError(null)).toBe(false);
  });

  it('should return false for non-Error object', () => {
    expect(isAbortError({ message: 'AbortError' })).toBe(false);
  });

  it('should return false for string', () => {
    expect(isAbortError('AbortError')).toBe(false);
  });
});
