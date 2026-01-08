import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Gpt51MenuService } from '../../gpt/gpt51-menu.service';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import { MENU_RECOMMENDATIONS_JSON_SCHEMA } from '@/external/openai/prompts';
import { PrometheusService } from '@/prometheus/prometheus.service';
import {
  createMockConfigService,
  createMockPrometheusService,
} from '../../../../test/mocks/external-clients.mock';

describe('Gpt51MenuService', () => {
  let service: Gpt51MenuService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPrometheusService: jest.Mocked<PrometheusService>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key',
      OPENAI_MENU_MODEL: 'gpt-5.1-custom',
    }) as unknown as jest.Mocked<ConfigService>;

    mockPrometheusService =
      createMockPrometheusService() as unknown as jest.Mocked<PrometheusService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Gpt51MenuService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrometheusService,
          useValue: mockPrometheusService,
        },
      ],
    }).compile();

    service = module.get<Gpt51MenuService>(Gpt51MenuService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use OPENAI_MENU_MODEL if configured', () => {
      expect(service['model']).toBe('gpt-5.1-custom');
    });

    it('should fallback to OPENAI_MODEL if OPENAI_MENU_MODEL is not configured', () => {
      const fallbackConfig = createMockConfigService({
        OPENAI_API_KEY: 'test-api-key',
        OPENAI_MODEL: 'gpt-fallback',
      }) as unknown as jest.Mocked<ConfigService>;

      const fallbackPrometheus =
        createMockPrometheusService() as unknown as jest.Mocked<PrometheusService>;

      const fallbackService = new Gpt51MenuService(
        fallbackConfig,
        fallbackPrometheus,
      );

      expect(fallbackService['model']).toBe('gpt-fallback');
    });

    it('should use default model if no environment variables configured', () => {
      const defaultConfig = createMockConfigService({
        OPENAI_API_KEY: 'test-api-key',
      }) as unknown as jest.Mocked<ConfigService>;

      const defaultPrometheus =
        createMockPrometheusService() as unknown as jest.Mocked<PrometheusService>;

      const defaultService = new Gpt51MenuService(
        defaultConfig,
        defaultPrometheus,
      );

      expect(defaultService['model']).toBe(OPENAI_CONFIG.DEFAULT_MODEL);
    });
  });

  describe('getModel', () => {
    it('should return the configured model', () => {
      expect(service['getModel']()).toBe('gpt-5.1-custom');
    });
  });

  describe('buildRequestParams', () => {
    const systemPrompt = 'You are a menu recommendation assistant.';
    const userPrompt = '오늘 점심 추천해줘';
    const jsonSchema = MENU_RECOMMENDATIONS_JSON_SCHEMA;

    it('should build request parameters with correct structure', () => {
      const params = service['buildRequestParams'](
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      expect(params).toEqual({
        model: 'gpt-5.1-custom',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'menu_recommendations',
            schema: jsonSchema,
            strict: true,
          },
        },
      });
    });

    it('should use strict mode for JSON schema', () => {
      const params = service['buildRequestParams'](
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      expect(params.response_format?.json_schema.strict).toBe(true);
    });

    it('should include system and user messages', () => {
      const params = service['buildRequestParams'](
        systemPrompt,
        userPrompt,
        jsonSchema,
      );

      expect(params.messages).toHaveLength(2);
      expect(params.messages[0].role).toBe('system');
      expect(params.messages[0].content).toBe(systemPrompt);
      expect(params.messages[1].role).toBe('user');
      expect(params.messages[1].content).toBe(userPrompt);
    });
  });

  describe('integration with BaseMenuService', () => {
    it('should inherit generateMenuRecommendations from BaseMenuService', () => {
      expect(service.generateMenuRecommendations).toBeDefined();
      expect(typeof service.generateMenuRecommendations).toBe('function');
    });

    it('should initialize OpenAI client on module init', () => {
      service.onModuleInit();
      expect(service['openai']).toBeDefined();
    });
  });
});
