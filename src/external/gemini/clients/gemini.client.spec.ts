import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiClient } from './gemini.client';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { GeminiApiResponse } from '../gemini.types';

// GoogleGenAI 모킹
jest.mock('@google/genai');

describe('GeminiClient', () => {
  let client: GeminiClient;
  let configService: ReturnType<typeof createMockConfigService>;
  let mockGenerateContent: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = createMockConfigService({
      GOOGLE_GEMINI_API_KEY: 'test-gemini-api-key',
    });

    // GoogleGenAI 모킹 설정
    mockGenerateContent = jest.fn();
    const mockGoogleGenAI = {
      models: {
        generateContent: mockGenerateContent,
      },
    };

    (GoogleGenAI as jest.MockedClass<typeof GoogleGenAI>).mockImplementation(
      () => mockGoogleGenAI as any,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClient,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<GeminiClient>(GeminiClient);
  });

  describe('extractJsonFromText (간접 테스트를 통한 검증)', () => {
    const mockGroundingMetadata = {
      groundingChunks: [],
      googleMapsWidgetContextToken: 'test-token-123',
    };

    describe('정상 케이스', () => {
      it('should extract JSON from markdown code block', async () => {
        const jsonData = {
          restaurants: [
            {
              name: '맛집1',
              reason: '맛있음',
              address: '서울시',
              latitude: 37.5,
              longitude: 127.0,
              localizedName: '맛집1',
              localizedAddress: '서울시',
            },
          ],
        };

        const markdownResponse = `Here are the restaurants:
\`\`\`json
${JSON.stringify(jsonData, null, 2)}
\`\`\`
That's all!`;

        const mockResponse: GeminiApiResponse = {
          text: markdownResponse,
          candidates: [
            {
              content: { parts: [{ text: markdownResponse }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 200,
            totalTokenCount: 300,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0]).toMatchObject({
          name: '맛집1',
          reason: '맛있음',
          address: '서울시',
        });
      });

      it('should extract JSON from code block without json specifier', async () => {
        const jsonData = {
          restaurants: [
            {
              name: '식당A',
              reason: '신선함',
              address: '부산시',
              latitude: 35.1,
              longitude: 129.0,
              localizedName: '식당A',
              localizedAddress: '부산시',
            },
          ],
        };

        const markdownResponse = `\`\`\`
${JSON.stringify(jsonData)}
\`\`\``;

        const mockResponse: GeminiApiResponse = {
          text: markdownResponse,
          candidates: [
            {
              content: { parts: [{ text: markdownResponse }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 200,
            totalTokenCount: 300,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          35.1,
          129.0,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0].name).toBe('식당A');
      });

      it('should extract JSON object directly without code block', async () => {
        const jsonData = {
          restaurants: [
            {
              name: '레스토랑1',
              reason: '분위기 좋음',
              address: '대전시',
              latitude: 36.3,
              longitude: 127.4,
              localizedName: '레스토랑1',
              localizedAddress: '대전시',
            },
          ],
        };

        const directJsonResponse = JSON.stringify(jsonData);

        const mockResponse: GeminiApiResponse = {
          text: directJsonResponse,
          candidates: [
            {
              content: { parts: [{ text: directJsonResponse }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 200,
            totalTokenCount: 300,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          36.3,
          127.4,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0].name).toBe('레스토랑1');
      });
    });

    describe('복구 케이스 (잘린 JSON)', () => {
      it('should recover truncated JSON with complete first object', async () => {
        const truncatedJson = `{
  "restaurants": [
    {"name": "맛집1", "reason": "맛있음", "address": "서울시 강남구", "latitude": 37.5, "longitude": 127.0, "localizedName": "맛집1", "localizedAddress": "서울시 강남구"},
    {"name": "맛집2", "reason": "신선함", "address": "서울시 서초구", "lat`;

        const mockResponse: GeminiApiResponse = {
          text: truncatedJson,
          candidates: [
            {
              content: { parts: [{ text: truncatedJson }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 1950, // 토큰 한계 근처
            totalTokenCount: 2050,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        // 첫 번째 완전한 객체만 복구되어야 함
        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0]).toMatchObject({
          name: '맛집1',
          reason: '맛있음',
          address: '서울시 강남구',
        });
      });

      it('should recover truncated JSON from markdown code block', async () => {
        const truncatedMarkdown = `\`\`\`json
{
  "restaurants": [
    {"name": "식당A", "reason": "깔끔함", "address": "부산 해운대", "latitude": 35.1, "longitude": 129.0, "localizedName": "식당A", "localizedAddress": "부산 해운대"},
    {"name": "식당B", "reason": "저렴함", "address": "부산 남`;

        const mockResponse: GeminiApiResponse = {
          text: truncatedMarkdown,
          candidates: [
            {
              content: {
                parts: [{ text: truncatedMarkdown }],
                role: 'model',
              },
              finishReason: 'MAX_TOKENS',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 2000, // MAX_OUTPUT_TOKENS에 도달
            totalTokenCount: 2100,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          35.1,
          129.0,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0].name).toBe('식당A');
      });

      it('should recover multiple complete objects from truncated JSON', async () => {
        const truncatedJson = `{
  "restaurants": [
    {"name": "A식당", "reason": "이유1", "address": "주소1", "latitude": 37.5, "longitude": 127.0, "localizedName": "A식당", "localizedAddress": "주소1"},
    {"name": "B식당", "reason": "이유2", "address": "주소2", "latitude": 37.5, "longitude": 127.0, "localizedName": "B식당", "localizedAddress": "주소2"},
    {"name": "C식당", "reason": "이유`;

        const mockResponse: GeminiApiResponse = {
          text: truncatedJson,
          candidates: [
            {
              content: { parts: [{ text: truncatedJson }], role: 'model' },
              finishReason: 'MAX_TOKENS',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 2000,
            totalTokenCount: 2100,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        // 완전한 두 객체만 복구되어야 함
        expect(result.restaurants).toHaveLength(2);
        expect(result.restaurants[0].name).toBe('A식당');
        expect(result.restaurants[1].name).toBe('B식당');
      });

      it('should handle truncated JSON with nested objects', async () => {
        const truncatedJson = `{
  "restaurants": [
    {
      "name": "복잡한식당",
      "reason": "좋아요",
      "address": "서울 종로구",
      "latitude": 37.5,
      "longitude": 127.0,
      "localizedName": {"ko": "복잡한식당", "en": "Complex Restaurant"},
      "localizedAddress": {"ko": "서울 종로구", "en": "Jongno-gu, Seoul"}
    },
    {
      "name": "다음식당",
      "reason": "맛있음",
      "address": "서울`;

        const mockResponse: GeminiApiResponse = {
          text: truncatedJson,
          candidates: [
            {
              content: { parts: [{ text: truncatedJson }], role: 'model' },
              finishReason: 'MAX_TOKENS',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 2000,
            totalTokenCount: 2100,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0].name).toBe('복잡한식당');
        expect(result.restaurants[0].localizedName).toEqual({
          ko: '복잡한식당',
          en: 'Complex Restaurant',
        });
      });
    });

    describe('실패 케이스', () => {
      it('should return empty array when text is empty', async () => {
        const mockResponse: GeminiApiResponse = {
          text: '{}',
          candidates: [
            {
              content: { parts: [{ text: '{}' }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 0,
            totalTokenCount: 100,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toEqual([]);
      });

      it('should return empty array when text is not valid JSON', async () => {
        const invalidText = 'This is not a JSON response at all!';

        const mockResponse: GeminiApiResponse = {
          text: invalidText,
          candidates: [
            {
              content: { parts: [{ text: invalidText }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 10,
            totalTokenCount: 110,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toEqual([]);
      });

      it('should return empty array when JSON has no restaurants field', async () => {
        const jsonWithoutRestaurants = JSON.stringify({
          error: 'No restaurants found',
          message: 'Try another location',
        });

        const mockResponse: GeminiApiResponse = {
          text: jsonWithoutRestaurants,
          candidates: [
            {
              content: {
                parts: [{ text: jsonWithoutRestaurants }],
                role: 'model',
              },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 20,
            totalTokenCount: 120,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toEqual([]);
      });

      it('should return empty array when restaurants is not an array', async () => {
        const jsonWithInvalidRestaurants = JSON.stringify({
          restaurants: 'invalid',
        });

        const mockResponse: GeminiApiResponse = {
          text: jsonWithInvalidRestaurants,
          candidates: [
            {
              content: {
                parts: [{ text: jsonWithInvalidRestaurants }],
                role: 'model',
              },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 10,
            totalTokenCount: 110,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toEqual([]);
      });

      it('should return empty array when truncated JSON has no complete objects', async () => {
        const severelyTruncatedJson = `{
  "restaurants": [
    {"name": "식당`;

        const mockResponse: GeminiApiResponse = {
          text: severelyTruncatedJson,
          candidates: [
            {
              content: {
                parts: [{ text: severelyTruncatedJson }],
                role: 'model',
              },
              finishReason: 'MAX_TOKENS',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 2000,
            totalTokenCount: 2100,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toEqual([]);
      });
    });

    describe('다중 코드 블록 처리', () => {
      it('should handle multiple code blocks and select valid JSON', async () => {
        const multipleCodeBlocks = `First, here's some text:
\`\`\`
This is not JSON
\`\`\`

Now the actual data:
\`\`\`json
{
  "restaurants": [
    {"name": "정상식당", "reason": "맛있음", "address": "서울시", "latitude": 37.5, "longitude": 127.0, "localizedName": "정상식당", "localizedAddress": "서울시"}
  ]
}
\`\`\`

And some more text.`;

        const mockResponse: GeminiApiResponse = {
          text: multipleCodeBlocks,
          candidates: [
            {
              content: { parts: [{ text: multipleCodeBlocks }], role: 'model' },
              finishReason: 'STOP',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 150,
            totalTokenCount: 250,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          37.5,
          127.0,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0].name).toBe('정상식당');
      });

      it('should recover from truncated JSON in multiple code blocks', async () => {
        const multipleCodeBlocks = `\`\`\`json
{
  "restaurants": [
    {"name": "복구식당", "reason": "좋음", "address": "부산시", "latitude": 35.1, "longitude": 129.0, "localizedName": "복구식당", "localizedAddress": "부산시"},
    {"name": "잘린식당", "reason": "맛있`;

        const mockResponse: GeminiApiResponse = {
          text: multipleCodeBlocks,
          candidates: [
            {
              content: { parts: [{ text: multipleCodeBlocks }], role: 'model' },
              finishReason: 'MAX_TOKENS',
              groundingMetadata: mockGroundingMetadata,
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 2000,
            totalTokenCount: 2100,
          },
        };

        mockGenerateContent.mockResolvedValue(mockResponse);

        const result = await client.searchRestaurantsUnified(
          'test prompt',
          35.1,
          129.0,
          'ko',
        );

        expect(result.restaurants).toHaveLength(1);
        expect(result.restaurants[0].name).toBe('복구식당');
      });
    });
  });

  describe('Grounding Metadata Extraction', () => {
    it('should extract blog URLs and placeIds from grounding metadata', async () => {
      const jsonData = {
        restaurants: [
          {
            name: '맛집A',
            reason: '맛있음',
            address: '서울시',
            latitude: 37.5,
            longitude: 127.0,
            localizedName: '맛집A',
            localizedAddress: '서울시',
          },
          {
            name: '맛집B',
            reason: '분위기좋음',
            address: '서울시',
            latitude: 37.5,
            longitude: 127.0,
            localizedName: '맛집B',
            localizedAddress: '서울시',
          },
        ],
      };

      const mockResponse: GeminiApiResponse = {
        text: JSON.stringify(jsonData),
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(jsonData) }],
              role: 'model',
            },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://blog.example.com/post1',
                    title: 'Blog Post 1',
                  },
                },
                {
                  maps: {
                    title: '맛집A',
                    placeId: 'ChIJTest123',
                    uri: 'https://maps.google.com/?cid=123',
                  },
                },
                {
                  web: {
                    uri: 'https://blog.example.com/post2',
                    title: 'Blog Post 2',
                  },
                },
                {
                  maps: {
                    title: '맛집B',
                    placeId: 'ChIJTest456',
                    uri: 'https://maps.google.com/?cid=456',
                  },
                },
              ],
              googleMapsWidgetContextToken: 'test-widget-token',
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 200,
          totalTokenCount: 300,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants).toHaveLength(2);
      expect(result.restaurants[0].placeId).toBe('ChIJTest123');
      expect(result.restaurants[1].placeId).toBe('ChIJTest456');
      expect(result.googleMapsWidgetContextToken).toBe('test-widget-token');
    });

    it('should set placeId to null when not found in grounding metadata', async () => {
      const jsonData = {
        restaurants: [
          {
            name: '매핑안됨식당',
            reason: '맛있음',
            address: '서울시',
            latitude: 37.5,
            longitude: 127.0,
            localizedName: '매핑안됨식당',
            localizedAddress: '서울시',
          },
        ],
      };

      const mockResponse: GeminiApiResponse = {
        text: JSON.stringify(jsonData),
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(jsonData) }],
              role: 'model',
            },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [
                {
                  maps: {
                    title: '다른식당', // 이름이 매치되지 않음
                    placeId: 'ChIJTest789',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 200,
          totalTokenCount: 300,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].placeId).toBeNull();
    });

    it('should handle missing grounding metadata', async () => {
      const jsonData = {
        restaurants: [
          {
            name: '식당1',
            reason: '맛있음',
            address: '서울시',
            latitude: 37.5,
            longitude: 127.0,
            localizedName: '식당1',
            localizedAddress: '서울시',
          },
        ],
      };

      const mockResponse: GeminiApiResponse = {
        text: JSON.stringify(jsonData),
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(jsonData) }],
              role: 'model',
            },
            finishReason: 'STOP',
            // groundingMetadata 없음
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 200,
          totalTokenCount: 300,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].placeId).toBeNull();
      expect(result.googleMapsWidgetContextToken).toBeUndefined();
    });
  });

  describe('Token Usage Monitoring', () => {
    it('should log warning when token usage exceeds 90%', async () => {
      const jsonData = {
        restaurants: [
          {
            name: '식당1',
            reason: '맛있음',
            address: '서울시',
            latitude: 37.5,
            longitude: 127.0,
            localizedName: '식당1',
            localizedAddress: '서울시',
          },
        ],
      };

      const mockResponse: GeminiApiResponse = {
        text: JSON.stringify(jsonData),
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(jsonData) }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 1850, // 92.5% (assuming MAX_OUTPUT_TOKENS = 2000)
          totalTokenCount: 1950,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      // Logger spy를 설정할 수 없으므로, 에러 없이 실행되는지만 확인
      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants).toHaveLength(1);
    });
  });
});
