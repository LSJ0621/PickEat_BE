import { AsyncLocalStorage } from 'async_hooks';

export interface StreamingContext {
  onRetry?: (attempt: number, error: unknown) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}

export const streamingAsyncLocalStorage =
  new AsyncLocalStorage<StreamingContext>();
