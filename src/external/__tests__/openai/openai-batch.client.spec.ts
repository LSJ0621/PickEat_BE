import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

jest.mock('openai');
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('OpenAiBatchClient', () => {
  let client: OpenAiBatchClient;
  let mockOpenAI: {
    files: {
      content: jest.Mock;
    };
    batches: {
      retrieve: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockOpenAI = {
      files: { content: jest.fn() },
      batches: { retrieve: jest.fn() },
    };

    (OpenAI as unknown as jest.Mock).mockImplementation(() => mockOpenAI);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiBatchClient,
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            OPENAI_API_KEY: 'test-openai-api-key',
          }),
        },
      ],
    }).compile();

    client = module.get<OpenAiBatchClient>(OpenAiBatchClient);
    // onModuleInit 호출 (OpenAI 클라이언트 초기화)
    await client.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('성공한 JSONL 결과를 파싱해 results Map을 반환한다', async () => {
    const successLine = JSON.stringify({
      id: 'batch_req_001',
      custom_id: 'pref_1_123',
      response: {
        status_code: 200,
        body: {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({ likes: ['한식'], dislikes: [] }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        },
      },
      error: null,
    });

    mockOpenAI.files.content.mockResolvedValue({ text: () => successLine });

    const result = await client.downloadResults('file-output-123');

    expect(result.results.size).toBe(1);
    expect(result.results.has('pref_1_123')).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('일부 실패한 JSONL 결과를 파싱해 results와 errors를 각각 반환한다', async () => {
    const successLine = JSON.stringify({
      id: 'batch_req_001',
      custom_id: 'pref_1_100',
      response: {
        status_code: 200,
        body: {
          id: 'chatcmpl-success',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"likes":["한식"]}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        },
      },
      error: null,
    });

    const apiErrorLine = JSON.stringify({
      id: 'batch_req_002',
      custom_id: 'pref_2_200',
      response: null,
      error: { code: 'invalid_api_key', message: 'Invalid API key' },
    });

    const nullContentLine = JSON.stringify({
      id: 'batch_req_003',
      custom_id: 'pref_3_300',
      response: {
        status_code: 200,
        body: {
          id: 'chatcmpl-null',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4o-mini',
          choices: [
            { index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        },
      },
      error: null,
    });

    const jsonl = [successLine, apiErrorLine, nullContentLine].join('\n');
    mockOpenAI.files.content.mockResolvedValue({ text: () => jsonl });

    const result = await client.downloadResults('file-output-456');

    expect(result.results.size).toBe(1);
    expect(result.results.has('pref_1_100')).toBe(true);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({
      customId: 'pref_2_200',
      reason: 'api_error',
    });
    expect(result.errors[1]).toMatchObject({
      customId: 'pref_3_300',
      reason: 'null_content',
    });
  });
});
