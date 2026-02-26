import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiClient } from '../../../../external/gemini/clients/gemini.client';
import { createMockConfigService } from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { GeminiApiResponse } from '../../../../external/gemini/gemini.types';

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
              nameKo: '맛집1',
              nameEn: 'Restaurant 1',
              reason: '맛있음',
              addressKo: '서울시',
              addressEn: 'Seoul',
              latitude: 37.5,
              longitude: 127.0,
              nameLocal: null,
              addressLocal: null,
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
          nameKo: '맛집1',
          reason: '맛있음',
          addressKo: '서울시',
        });
      });

      it('should extract JSON from code block without json specifier', async () => {
        const jsonData = {
          restaurants: [
            {
              nameKo: '식당A',
              nameEn: 'Restaurant A',
              reason: '신선함',
              addressKo: '부산시',
              addressEn: 'Busan',
              latitude: 35.1,
              longitude: 129.0,
              nameLocal: null,
              addressLocal: null,
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
        expect(result.restaurants[0].nameKo).toBe('식당A');
      });

      it('should extract JSON object directly without code block', async () => {
        const jsonData = {
          restaurants: [
            {
              nameKo: '레스토랑1',
              nameEn: 'Restaurant 1',
              reason: '분위기 좋음',
              addressKo: '대전시',
              addressEn: 'Daejeon',
              latitude: 36.3,
              longitude: 127.4,
              nameLocal: null,
              addressLocal: null,
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
        expect(result.restaurants[0].nameKo).toBe('레스토랑1');
      });
    });

    describe('복구 케이스 (잘린 JSON)', () => {
      it('should recover truncated JSON with complete first object', async () => {
        const truncatedJson = `{
  "restaurants": [
    {"nameKo": "맛집1", "nameEn": "Restaurant 1", "reason": "맛있음", "addressKo": "서울시 강남구", "addressEn": "Gangnam-gu, Seoul", "latitude": 37.5, "longitude": 127.0, "nameLocal": null, "addressLocal": null},
    {"nameKo": "맛집2", "nameEn": "Restaurant 2", "reason": "신선함", "addressKo": "서울시 서초구", "lat`;

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
          nameKo: '맛집1',
          reason: '맛있음',
          addressKo: '서울시 강남구',
        });
      });

      it('should recover truncated JSON from markdown code block', async () => {
        const truncatedMarkdown = `\`\`\`json
{
  "restaurants": [
    {"nameKo": "식당A", "nameEn": "Restaurant A", "reason": "깔끔함", "addressKo": "부산 해운대", "addressEn": "Haeundae, Busan", "latitude": 35.1, "longitude": 129.0, "nameLocal": null, "addressLocal": null},
    {"nameKo": "식당B", "nameEn": "Restaurant B", "reason": "저렴함", "addressKo": "부산 남`;

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
        expect(result.restaurants[0].nameKo).toBe('식당A');
      });

      it('should recover multiple complete objects from truncated JSON', async () => {
        const truncatedJson = `{
  "restaurants": [
    {"nameKo": "A식당", "nameEn": "Restaurant A", "reason": "이유1", "addressKo": "주소1", "addressEn": "Address 1", "latitude": 37.5, "longitude": 127.0, "nameLocal": null, "addressLocal": null},
    {"nameKo": "B식당", "nameEn": "Restaurant B", "reason": "이유2", "addressKo": "주소2", "addressEn": "Address 2", "latitude": 37.5, "longitude": 127.0, "nameLocal": null, "addressLocal": null},
    {"nameKo": "C식당", "nameEn": "Restaurant C", "reason": "이유`;

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
        expect(result.restaurants[0].nameKo).toBe('A식당');
        expect(result.restaurants[1].nameKo).toBe('B식당');
      });

      it('should handle truncated JSON with nested objects', async () => {
        const truncatedJson = `{
  "restaurants": [
    {
      "nameKo": "복잡한식당",
      "nameEn": "Complex Restaurant",
      "reason": "좋아요",
      "addressKo": "서울 종로구",
      "addressEn": "Jongno-gu, Seoul",
      "latitude": 37.5,
      "longitude": 127.0,
      "nameLocal": {"ko": "복잡한식당", "en": "Complex Restaurant"},
      "addressLocal": {"ko": "서울 종로구", "en": "Jongno-gu, Seoul"}
    },
    {
      "nameKo": "다음식당",
      "nameEn": "Next Restaurant",
      "reason": "맛있음",
      "addressKo": "서울`;

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
        expect(result.restaurants[0].nameKo).toBe('복잡한식당');
        expect(result.restaurants[0].nameLocal).toEqual({
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
    {"nameKo": "정상식당", "nameEn": "Normal Restaurant", "reason": "맛있음", "addressKo": "서울시", "addressEn": "Seoul", "latitude": 37.5, "longitude": 127.0, "nameLocal": null, "addressLocal": null}
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
        expect(result.restaurants[0].nameKo).toBe('정상식당');
      });

      it('should recover from truncated JSON in multiple code blocks', async () => {
        const multipleCodeBlocks = `\`\`\`json
{
  "restaurants": [
    {"nameKo": "복구식당", "nameEn": "Recovery Restaurant", "reason": "좋음", "addressKo": "부산시", "addressEn": "Busan", "latitude": 35.1, "longitude": 129.0, "nameLocal": null, "addressLocal": null},
    {"nameKo": "잘린식당", "nameEn": "Truncated Restaurant", "reason": "맛있`;

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
        expect(result.restaurants[0].nameKo).toBe('복구식당');
      });
    });
  });

  describe('isEnabled (line 45) - disabled path', () => {
    it('should return empty restaurants and log warn when genAI is null (no API key)', async () => {
      const noKeyConfigService = createMockConfigService({
        GOOGLE_GEMINI_API_KEY: '',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiClient,
          { provide: ConfigService, useValue: noKeyConfigService },
        ],
      }).compile();

      const disabledClient = module.get<GeminiClient>(GeminiClient);

      const result = await disabledClient.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.success).toBe(false);
      expect(result.restaurants).toHaveLength(0);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('nameLocal-based placeId matching (lines 189-192)', () => {
    it('should match placeId via nameLocal when groundingChunk title matches nameLocal', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '스시 야마모토',
            nameEn: 'Sushi Yamamoto',
            nameLocal: '寿司 山本',
            reason: '신선한 스시',
            addressKo: '서울시 강남구',
            addressEn: 'Gangnam-gu, Seoul',
            addressLocal: '東京都 渋谷区',
            latitude: 37.5,
            longitude: 127.0,
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
                    // title matches nameLocal '寿司 山本' - key.includes(nameLocalLower) test
                    title: '寿司 山本',
                    placeId: 'places/ChIJNameLocalMatch',
                  },
                },
              ],
              googleMapsWidgetContextToken: 'token-local',
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
      // placeId starts with 'places/' → slice(7) applied (line 294)
      expect(result.restaurants[0].placeId).toBe('ChIJNameLocalMatch');
    });

    it('should match placeId via nameLocal partial match (nameLocalLower.includes(key))', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '야마모토 레스토랑',
            nameEn: 'Yamamoto Restaurant',
            nameLocal: '山本レストラン 渋谷店',
            reason: '좋음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            addressLocal: '渋谷区',
            latitude: 37.5,
            longitude: 127.0,
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
                    // key '山本レストラン' is included in nameLocal '山本レストラン 渋谷店'
                    title: '山本レストラン',
                    placeId: 'ChIJPartialLocalMatch',
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
      expect(result.restaurants[0].placeId).toBe('ChIJPartialLocalMatch');
    });
  });

  describe('placeId with places/ prefix stripping (line 294)', () => {
    it('should strip places/ prefix from placeId in groundingChunk', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '테스트 식당',
            nameEn: 'Test Restaurant',
            nameLocal: null,
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            addressLocal: null,
            latitude: 37.5,
            longitude: 127.0,
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
                    title: '테스트 식당',
                    placeId: 'places/ChIJStripped123',
                  },
                },
              ],
              googleMapsWidgetContextToken: 'token-xyz',
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 100,
          totalTokenCount: 150,
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
      // 'places/ChIJStripped123' → slice(7) → 'ChIJStripped123'
      expect(result.restaurants[0].placeId).toBe('ChIJStripped123');
    });
  });

  describe('extractJsonFromText multiple code blocks - recovery paths (lines 345, 352-363)', () => {
    it('should recover JSON from second code block when first code block is invalid (line 345 - recovered path)', async () => {
      // Two code blocks: first is truncated/invalid, second is valid after recovery
      const multipleBlocksWithRecoverable = `\`\`\`json
{
  "restaurants": [
    {"nameKo": "첫번째식당", "nameEn": "First", "reason": "맛있음", "addressKo": "서울", "addressEn": "Seoul", "latitude": 37.5, "longitude": 127.0, "nameLocal": null, "addressLocal": null},
    {"nameKo": "잘린식당", "nameEn": "Truncated
\`\`\`

\`\`\`json
{"not": "a restaurant response"
\`\`\``;

      const mockResponse: GeminiApiResponse = {
        text: multipleBlocksWithRecoverable,
        candidates: [
          {
            content: {
              parts: [{ text: multipleBlocksWithRecoverable }],
              role: 'model',
            },
            finishReason: 'MAX_TOKENS',
            groundingMetadata: {
              groundingChunks: [],
              googleMapsWidgetContextToken: undefined,
            },
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

      // The first block is truncated but recoverTruncatedJson should rescue '첫번째식당'
      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].nameKo).toBe('첫번째식당');
    });

    it('should fall back to longest block when all code blocks fail recovery (lines 352-363)', async () => {
      // Two code blocks: both fail JSON.parse and recoverTruncatedJson returns null
      // The longest block should be returned as raw text, causing parse error → empty restaurants
      const allInvalidBlocks = `\`\`\`json
not valid json at all - no restaurants key here
\`\`\`

\`\`\`json
also invalid json - this is the longest block with more text to be the longest one selected
\`\`\``;

      const mockResponse: GeminiApiResponse = {
        text: allInvalidBlocks,
        candidates: [
          {
            content: {
              parts: [{ text: allInvalidBlocks }],
              role: 'model',
            },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [],
              googleMapsWidgetContextToken: undefined,
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      // Both blocks are invalid JSON, recovery fails → returns longest block raw → parse fails → empty
      expect(result.success).toBe(false);
      expect(result.restaurants).toHaveLength(0);
    });
  });

  describe('Grounding Metadata Extraction', () => {
    it('should extract blog URLs and placeIds from grounding metadata', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '맛집A',
            nameEn: 'Restaurant A',
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
          {
            nameKo: '맛집B',
            nameEn: 'Restaurant B',
            reason: '분위기좋음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
            nameKo: '매핑안됨식당',
            nameEn: 'Unmapped Restaurant',
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
            nameKo: '식당1',
            nameEn: 'Restaurant 1',
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
            nameKo: '식당1',
            nameEn: 'Restaurant 1',
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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

  describe('Disabled State', () => {
    it('should return empty result when API key is not configured', async () => {
      const emptyConfigService = createMockConfigService({});

      const module = await Test.createTestingModule({
        providers: [
          GeminiClient,
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const disabledClient = module.get<GeminiClient>(GeminiClient);

      const result = await disabledClient.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.success).toBe(false);
      expect(result.restaurants).toEqual([]);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return success false and empty restaurants when API key is empty string', async () => {
      const emptyKeyConfigService = createMockConfigService({
        GOOGLE_GEMINI_API_KEY: '',
      });

      const module = await Test.createTestingModule({
        providers: [
          GeminiClient,
          { provide: ConfigService, useValue: emptyKeyConfigService },
        ],
      }).compile();

      const disabledClient = module.get<GeminiClient>(GeminiClient);

      const result = await disabledClient.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'en',
      );

      expect(result.success).toBe(false);
      expect(result.restaurants).toEqual([]);
    });
  });

  describe('placeId prefix stripping', () => {
    it('should strip "places/" prefix from placeId in grounding chunks', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '식당1',
            nameEn: 'Restaurant 1',
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
                    title: '식당1',
                    placeId: 'places/ChIJTest123',
                  },
                },
              ],
              googleMapsWidgetContextToken: 'test-token',
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      // "places/" prefix should be stripped
      expect(result.restaurants[0].placeId).toBe('ChIJTest123');
    });

    it('should not strip prefix when placeId does not start with "places/"', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '식당1',
            nameEn: 'Restaurant 1',
            reason: '맛있음',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
                    title: '식당1',
                    placeId: 'ChIJRaw456',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants[0].placeId).toBe('ChIJRaw456');
    });
  });

  describe('placeId deduplication within batch', () => {
    it('should deduplicate restaurants with the same placeId', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '식당A',
            nameEn: 'Restaurant A',
            reason: '이유1',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
          {
            nameKo: '식당A duplicate',
            nameEn: 'Restaurant A2',
            reason: '이유2',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
                    title: '식당A',
                    placeId: 'ChIJSamePlaceId',
                  },
                },
                {
                  maps: {
                    title: '식당A duplicate',
                    placeId: 'ChIJSamePlaceId',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 100,
          totalTokenCount: 200,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      // Duplicate placeId should be removed, keeping only the first
      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].nameKo).toBe('식당A');
    });

    it('should keep restaurants with null placeId (not deduplicated)', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '식당X',
            nameEn: 'Restaurant X',
            reason: '이유',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
          {
            nameKo: '식당Y',
            nameEn: 'Restaurant Y',
            reason: '이유',
            addressKo: '주소',
            addressEn: 'Address',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
              groundingChunks: [],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 100,
          totalTokenCount: 200,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      // Both have null placeId, both should be kept
      expect(result.restaurants).toHaveLength(2);
      expect(result.restaurants[0].placeId).toBeNull();
      expect(result.restaurants[1].placeId).toBeNull();
    });
  });

  describe('text extraction from candidates fallback', () => {
    it('should use candidate content text when response.text is null', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '후보텍스트식당',
            nameEn: 'Candidate Text Restaurant',
            reason: '이유',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
          },
        ],
      };

      const textContent = JSON.stringify(jsonData);

      const mockResponse: GeminiApiResponse = {
        text: null as unknown as string,
        candidates: [
          {
            content: {
              parts: [{ text: textContent }],
              role: 'model',
            },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.success).toBe(true);
      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].nameKo).toBe('후보텍스트식당');
    });

    it('should return empty result when both response.text and candidate text are null', async () => {
      const mockResponse: GeminiApiResponse = {
        text: null as unknown as string,
        candidates: [
          {
            content: {
              parts: [{ text: null as unknown as string }],
              role: 'model',
            },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [],
            },
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

      expect(result.success).toBe(false);
      expect(result.restaurants).toEqual([]);
    });
  });

  describe('placeId matching via nameEn fallback', () => {
    it('should match placeId via nameEn when nameLocal and nameKo do not match', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '레스토랑',
            nameEn: 'SushiPlace',
            reason: '이유',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
                    title: 'sushiplace', // lowercase in map, matches nameEn
                    placeId: 'ChIJEnMatch',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants[0].placeId).toBe('ChIJEnMatch');
    });
  });

  describe('reasonTags handling', () => {
    it('should default reasonTags to empty array when not an array', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '식당1',
            nameEn: 'Restaurant 1',
            reason: '이유',
            reasonTags: 'not-an-array',
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
            groundingMetadata: { groundingChunks: [] },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants[0].reasonTags).toEqual([]);
    });

    it('should preserve reasonTags array when it is a valid array', async () => {
      const jsonData = {
        restaurants: [
          {
            nameKo: '식당1',
            nameEn: 'Restaurant 1',
            reason: '이유',
            reasonTags: ['맛집', '분위기 좋음'],
            addressKo: '서울시',
            addressEn: 'Seoul',
            latitude: 37.5,
            longitude: 127.0,
            nameLocal: null,
            addressLocal: null,
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
            groundingMetadata: { groundingChunks: [] },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.searchRestaurantsUnified(
        'test prompt',
        37.5,
        127.0,
        'ko',
      );

      expect(result.restaurants[0].reasonTags).toEqual(['맛집', '분위기 좋음']);
    });
  });
});
