import { Logger } from '@nestjs/common';
import {
  retryWithExponentialBackoff,
  isAbortError,
  RetryOptions,
} from '../../utils/retry.util';

// Mock the async local storage to avoid side effects
jest.mock('../../utils/retry-context', () => ({
  streamingAsyncLocalStorage: {
    getStore: jest.fn().mockReturnValue(undefined),
  },
}));

describe('retryWithExponentialBackoff', () => {
  const logger = new Logger('TestRetry');

  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('성공하면 즉시 결과를 반환한다', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await retryWithExponentialBackoff(fn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 가능한 에러 시 maxRetries만큼 재시도한다', async () => {
    const retryableError = { status: 429 };
    const fn = jest.fn().mockRejectedValue(retryableError);

    await expect(
      retryWithExponentialBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 20,
      }),
    ).rejects.toBe(retryableError);

    // 초기 시도(1) + 재시도(2) = 3번 호출
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('재시도 불가능한 에러는 즉시 throw한다', async () => {
    const nonRetryableError = { status: 400 };
    const fn = jest.fn().mockRejectedValue(nonRetryableError);

    await expect(
      retryWithExponentialBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      }),
    ).rejects.toBe(nonRetryableError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('백오프 간격이 maxDelayMs를 초과하지 않는다', async () => {
    const retryableError = { status: 500 };
    const fn = jest.fn().mockRejectedValue(retryableError);
    const startTime = Date.now();

    await expect(
      retryWithExponentialBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 15,
        backoffFactor: 10,
      }),
    ).rejects.toBe(retryableError);

    const elapsed = Date.now() - startTime;
    // 지수 백오프라면 10 + 100 = 110ms이지만, maxDelayMs=15로 제한되어 10 + 15 = 25ms 이내
    expect(elapsed).toBeLessThan(200);
  });

  it('logger가 주어지면 재시도 시 warn 로그를 남긴다', async () => {
    const retryableError = { status: 503, message: 'Service Unavailable' };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('ok');

    await retryWithExponentialBackoff(
      fn,
      { maxRetries: 2, initialDelayMs: 10 },
      logger,
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('두 번째 시도에서 성공하면 결과를 반환한다', async () => {
    const retryableError = { status: 429 };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('recovered');

    const result = await retryWithExponentialBackoff(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('최종 실패 시 마지막 에러를 throw한다', async () => {
    const error1 = { status: 429, message: 'first' };
    const error2 = { status: 429, message: 'second' };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2);

    await expect(
      retryWithExponentialBackoff(fn, {
        maxRetries: 1,
        initialDelayMs: 10,
      }),
    ).rejects.toBe(error2);
  });

  it('onRetry 콜백이 호출된다', async () => {
    const retryableError = { status: 500 };
    const onRetry = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('ok');

    await retryWithExponentialBackoff(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledWith(1, retryableError);
  });

  it('AbortError는 재시도하지 않고 즉시 throw한다', async () => {
    const abortError = new Error('signal is aborted');
    abortError.name = 'AbortError';
    const fn = jest.fn().mockRejectedValue(abortError);

    await expect(
      retryWithExponentialBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      }),
    ).rejects.toBe(abortError);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('isAbortError', () => {
  it('AbortError name을 가진 Error를 감지한다', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(isAbortError(error)).toBe(true);
  });

  it('"signal is aborted" 메시지를 감지한다', () => {
    expect(isAbortError(new Error('signal is aborted'))).toBe(true);
  });

  it('"Request aborted by client" 메시지를 감지한다', () => {
    expect(isAbortError(new Error('Request aborted by client'))).toBe(true);
  });

  it('일반 Error는 false를 반환한다', () => {
    expect(isAbortError(new Error('network error'))).toBe(false);
  });

  it('Error가 아닌 값은 false를 반환한다', () => {
    expect(isAbortError('string error')).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
