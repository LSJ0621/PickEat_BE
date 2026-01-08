export type StatusGroup = '2xx' | '4xx' | '5xx' | '429' | 'timeout';

export function elapsedSeconds(startedAt: number): number {
  return (Date.now() - startedAt) / 1000;
}

export function parseTokens(raw: unknown): number {
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/,/g, '').trim();
    const parsed = Number(cleaned);
    return parsed;
  }
  return Number(raw);
}

interface ErrorWithStatus {
  status?: number;
  statusCode?: number;
  response?: {
    status?: number;
  };
}

function isErrorWithStatus(error: unknown): error is ErrorWithStatus {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'statusCode' in error || 'response' in error)
  );
}

export function mapStatusGroupFromError(error: unknown): StatusGroup {
  if (!isErrorWithStatus(error)) {
    return 'timeout';
  }

  const status = error.status ?? error.response?.status ?? error.statusCode;

  if (status === 429) return '429';
  if (typeof status === 'number') {
    if (status >= 500) return '5xx';
    if (status >= 400) return '4xx';
    return '2xx';
  }
  return 'timeout';
}
