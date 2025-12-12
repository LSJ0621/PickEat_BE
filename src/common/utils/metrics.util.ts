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

export function mapStatusGroupFromError(error: unknown): StatusGroup {
  const status =
    (error as any)?.status ??
    (error as any)?.response?.status ??
    (error as any)?.statusCode;

  if (status === 429) return '429';
  if (typeof status === 'number') {
    if (status >= 500) return '5xx';
    if (status >= 400) return '4xx';
    return '2xx';
  }
  return 'timeout';
}
