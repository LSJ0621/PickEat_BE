import { OpenAiBatchClient } from '../clients/openai-batch.client';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';

interface MockOpenAI {
  files: {
    content: jest.Mock;
    create: jest.Mock;
  };
  batches: {
    create: jest.Mock;
    retrieve: jest.Mock;
    cancel: jest.Mock;
  };
}

function buildMockOpenAi(): MockOpenAI {
  return {
    files: { content: jest.fn(), create: jest.fn() },
    batches: { create: jest.fn(), retrieve: jest.fn(), cancel: jest.fn() },
  };
}

describe('OpenAiBatchClient', () => {
  let client: OpenAiBatchClient;

  beforeEach(() => {
    client = Object.create(OpenAiBatchClient.prototype);
    (client as unknown as { openai: unknown }).openai = null;
    (client as unknown as { logger: Partial<Console> }).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    (client as unknown as { retryOptions: object }).retryOptions = {
      retryableStatusCodes: [429, 500, 502, 503, 504],
      maxRetries: 0,
      initialDelayMs: 0,
      maxDelayMs: 0,
    };
  });

  describe('isReady', () => {
    it('openai 클라이언트가 null이면 false를 반환한다', () => {
      expect(client.isReady()).toBe(false);
    });

    it('openai 클라이언트가 설정되면 true를 반환한다', () => {
      (client as any).openai = {};
      expect(client.isReady()).toBe(true);
    });
  });

  describe('createBatchContent', () => {
    it('BatchRequest 배열을 JSONL 문자열로 변환한다', () => {
      const requests = [
        {
          custom_id: 'pref_1_1',
          method: 'POST' as const,
          url: '/v1/chat/completions' as const,
          body: {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user' as const, content: 'hello' }],
          },
        },
        {
          custom_id: 'pref_2_2',
          method: 'POST' as const,
          url: '/v1/chat/completions' as const,
          body: {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user' as const, content: 'world' }],
          },
        },
      ];

      const result = client.createBatchContent(requests);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).custom_id).toBe('pref_1_1');
      expect(JSON.parse(lines[1]).custom_id).toBe('pref_2_2');
    });

    it('빈 배열이면 빈 문자열을 반환한다', () => {
      const result = client.createBatchContent([]);
      expect(result).toBe('');
    });
  });

  describe('downloadResults 파싱 로직', () => {
    it('성공 응답에서 custom_id와 content를 추출한다', async () => {
      const mockText = JSON.stringify({
        id: 'resp_1',
        custom_id: 'pref_1_1',
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { content: '{"analysis":"test"}' } }],
          },
        },
        error: null,
      });

      // downloadResults의 파싱 로직을 직접 테스트
      (client as any).openai = {
        files: {
          content: jest.fn().mockResolvedValue({ text: () => Promise.resolve(mockText) }),
        },
      };
      (client as any).logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

      const result = await client.downloadResults('file_123');

      expect(result.results.size).toBe(1);
      expect(result.results.get('pref_1_1')).toBe('{"analysis":"test"}');
      expect(result.errors).toHaveLength(0);
    });

    it('API 에러 응답을 errors 배열에 추가한다', async () => {
      const mockText = JSON.stringify({
        id: 'resp_1',
        custom_id: 'pref_1_1',
        response: null,
        error: { code: 'rate_limit', message: 'Too many requests' },
      });

      (client as any).openai = {
        files: {
          content: jest.fn().mockResolvedValue({ text: () => Promise.resolve(mockText) }),
        },
      };
      (client as any).logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

      const result = await client.downloadResults('file_123');

      expect(result.results.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('api_error');
    });

    it('downloadResults — JSONL 한 줄 파싱 실패 → 해당 줄만 errors에 기록', async () => {
      const goodLine = JSON.stringify({
        id: 'r1',
        custom_id: 'pref_1_1',
        response: {
          status_code: 200,
          body: { choices: [{ message: { content: '{"analysis":"ok"}' } }] },
        },
        error: null,
      });
      const mockText = `${goodLine}\n{ this is not json`;
      (client as unknown as { openai: MockOpenAI }).openai = buildMockOpenAi();
      (client as unknown as { openai: MockOpenAI }).openai.files.content.mockResolvedValue({
        text: () => Promise.resolve(mockText),
      });

      const result = await client.downloadResults('file_abc');

      expect(result.results.size).toBe(1);
      expect(result.results.get('pref_1_1')).toBe('{"analysis":"ok"}');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('parse_error');
    });

    it('content가 null인 응답을 errors에 추가한다', async () => {
      const mockText = JSON.stringify({
        id: 'resp_1',
        custom_id: 'pref_1_1',
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { content: null } }],
          },
        },
        error: null,
      });

      (client as any).openai = {
        files: {
          content: jest.fn().mockResolvedValue({ text: () => Promise.resolve(mockText) }),
        },
      };
      (client as any).logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

      const result = await client.downloadResults('file_123');

      expect(result.results.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('null_content');
    });
  });

  describe('createBatch', () => {
    it('정상 호출 → batchId (string) 반환', async () => {
      const mock = buildMockOpenAi();
      mock.batches.create.mockResolvedValue({ id: 'batch_abc' });
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      const result = await client.createBatch('file_xyz', { foo: 'bar' });

      expect(typeof result).toBe('string');
      expect(result).toBe('batch_abc');
    });

    it('500 서버 에러 → 에러 전파', async () => {
      const mock = buildMockOpenAi();
      mock.batches.create.mockRejectedValue(
        Object.assign(new Error('server error'), { status: 500 }),
      );
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      await expect(client.createBatch('file_xyz')).rejects.toThrow();
    });
  });

  describe('getBatchStatus', () => {
    it('정상 응답 → status, outputFileId, errorFileId, progress 파싱', async () => {
      const mock = buildMockOpenAi();
      mock.batches.retrieve.mockResolvedValue({
        status: 'completed',
        output_file_id: 'file_out',
        error_file_id: 'file_err',
        request_counts: { total: 10, completed: 8, failed: 2 },
      });
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      const result = await client.getBatchStatus('batch_1');

      expect(result.status).toBe('completed');
      expect(result.outputFileId).toBe('file_out');
      expect(result.errorFileId).toBe('file_err');
      expect(result.progress).toEqual({ total: 10, completed: 8, failed: 2 });
    });

    it('인증 만료(401) → 에러 전파', async () => {
      const mock = buildMockOpenAi();
      mock.batches.retrieve.mockRejectedValue(
        Object.assign(new Error('unauthorized'), { status: 401 }),
      );
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      await expect(client.getBatchStatus('batch_1')).rejects.toThrow('unauthorized');
    });
  });

  describe('uploadBatchContent', () => {
    it('정상 업로드 → fileId 반환', async () => {
      const mock = buildMockOpenAi();
      mock.files.create.mockResolvedValue({ id: 'file_new' });
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      const result = await client.uploadBatchContent('{"custom_id":"x"}');

      expect(result).toBe('file_new');
    });
  });

  describe('downloadErrors', () => {
    it('정상 → BatchError[] 반환', async () => {
      const line1 = JSON.stringify({
        custom_id: 'pref_1_1',
        error: { code: 'bad_request', message: 'invalid' },
      });
      const line2 = JSON.stringify({
        custom_id: 'pref_2_2',
        error: { code: 'rate_limit', message: 'slow down' },
      });
      const mock = buildMockOpenAi();
      mock.files.content.mockResolvedValue({
        text: () => Promise.resolve(`${line1}\n${line2}`),
      });
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      const result = await client.downloadErrors('file_err');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        customId: 'pref_1_1',
        code: 'bad_request',
        message: 'invalid',
      });
      expect(result[1].code).toBe('rate_limit');
    });
  });

  describe('cancelBatch', () => {
    it('정상 → 예외 없이 완료', async () => {
      const mock = buildMockOpenAi();
      mock.batches.cancel.mockResolvedValue({ id: 'batch_1', status: 'cancelled' });
      (client as unknown as { openai: MockOpenAI }).openai = mock;

      await expect(client.cancelBatch('batch_1')).resolves.toBeUndefined();
      expect(mock.batches.cancel).toHaveBeenCalledWith('batch_1');
    });
  });

  describe('ensureClient 분기', () => {
    it('openai 미초기화 상태에서 createBatch 호출 → ConfigMissingException', async () => {
      (client as unknown as { openai: null }).openai = null;

      await expect(client.createBatch('file_x')).rejects.toBeInstanceOf(
        ConfigMissingException,
      );
    });
  });
});
