import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiClient } from '@/external/gemini/clients/gemini.client';
import { GeminiApiResponse } from '@/external/gemini/gemini.types';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

jest.mock('@google/genai');
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

const buildGeminiResponse = (
  text: string,
  groundingChunks?: Array<{ maps?: { placeId: string; title: string } }>,
): GeminiApiResponse => ({
  text,
  candidates: [
    {
      content: { parts: [{ text }], role: 'model' },
      finishReason: 'STOP',
      groundingMetadata: {
        groundingChunks: groundingChunks ?? [],
        googleMapsWidgetContextToken: 'mock-widget-token',
      },
    },
  ],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 200,
    totalTokenCount: 300,
  },
});

describe('GeminiClient', () => {
  let client: GeminiClient;
  let mockGenerateContent: jest.Mock;

  beforeEach(async () => {
    mockGenerateContent = jest.fn();
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClient,
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            GOOGLE_GEMINI_API_KEY: 'test-api-key',
          }),
        },
      ],
    }).compile();

    client = module.get<GeminiClient>(GeminiClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('마크다운 코드블록의 정상 JSON 응답을 파싱해 restaurants와 placeId를 반환한다', async () => {
    const restaurantJson = JSON.stringify({
      restaurants: [
        {
          nameKo: '맛있는 한식당',
          nameEn: 'Delicious Korean Restaurant',
          nameLocal: null,
          reason: '전통 한식으로 유명합니다',
          reasonTags: ['한식', '전통'],
          addressKo: '서울특별시 강남구 테헤란로 123',
          addressEn: '123 Teheran-ro, Gangnam-gu, Seoul',
          addressLocal: null,
          latitude: 37.5012345,
          longitude: 127.0398765,
        },
      ],
    });

    mockGenerateContent.mockResolvedValue(
      buildGeminiResponse(`\`\`\`json\n${restaurantJson}\n\`\`\``, [
        {
          maps: {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            title: '맛있는 한식당',
          },
        },
      ]),
    );

    const result = await client.searchRestaurantsUnified(
      '강남 맛집 추천',
      37.5012345,
      127.0398765,
      'ko',
    );

    expect(result.success).toBe(true);
    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0].nameKo).toBe('맛있는 한식당');
    expect(result.restaurants[0].placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
  });

  it('잘린 JSON 응답에서 완전한 레스토랑 객체만 복구해 반환한다', async () => {
    // 두 번째 레스토랑이 잘린 JSON (첫 번째만 완전한 객체)
    const truncatedText = `\`\`\`json
{
  "restaurants": [
    {
      "nameKo": "첫번째 식당",
      "nameEn": "First Restaurant",
      "nameLocal": null,
      "reason": "훌륭한 맛",
      "reasonTags": ["맛집"],
      "addressKo": "서울 강남구",
      "addressEn": "Gangnam, Seoul",
      "addressLocal": null,
      "latitude": 37.5,
      "longitude": 127.0
    },
    {
      "nameKo": "두번째 식당",
      "nameEn": "Second Restaurant",
      "reason": "분위기가
\`\`\``;

    mockGenerateContent.mockResolvedValue(buildGeminiResponse(truncatedText));

    const result = await client.searchRestaurantsUnified(
      '강남 맛집',
      37.5,
      127.0,
      'ko',
    );

    expect(result.success).toBe(true);
    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0].nameKo).toBe('첫번째 식당');
  });

  it('API 호출 실패 시 에러가 상위로 전파된다', async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('Gemini API quota exceeded'),
    );

    await expect(
      client.searchRestaurantsUnified('맛집', 37.5, 127.0, 'ko'),
    ).rejects.toThrow('Gemini API quota exceeded');
  });

  it('응답 텍스트가 비어있으면 success=false로 빈 restaurants를 반환한다', async () => {
    const emptyResponse = {
      text: '',
      candidates: [
        {
          content: { parts: [{ text: '' }], role: 'model' },
          finishReason: 'STOP',
          groundingMetadata: {
            groundingChunks: [],
            googleMapsWidgetContextToken: 'widget-token-empty',
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 0,
        totalTokenCount: 10,
      },
    };
    mockGenerateContent.mockResolvedValue(emptyResponse as unknown as GeminiApiResponse);

    const result = await client.searchRestaurantsUnified(
      '맛집',
      37.5,
      127.0,
      'ko',
    );

    expect(result.success).toBe(false);
    expect(result.restaurants).toEqual([]);
    expect(result.googleMapsWidgetContextToken).toBe('widget-token-empty');
  });

  it('JSON 파싱이 완전히 실패하면 success=false를 반환한다', async () => {
    mockGenerateContent.mockResolvedValue(
      buildGeminiResponse('이건 JSON이 전혀 아닙니다'),
    );

    const result = await client.searchRestaurantsUnified(
      '맛집',
      37.5,
      127.0,
      'ko',
    );

    expect(result.success).toBe(false);
    expect(result.restaurants).toEqual([]);
  });

  it('단일 배치 내 동일 placeId는 중복 제거된다', async () => {
    const restaurantJson = JSON.stringify({
      restaurants: [
        {
          nameKo: '가게A',
          nameEn: 'Store A',
          nameLocal: null,
          reason: '이유',
          reasonTags: [],
          addressKo: '주소A',
          addressEn: 'addr A',
          addressLocal: null,
          latitude: 37.5,
          longitude: 127.0,
        },
        {
          nameKo: '가게A',
          nameEn: 'Store A',
          nameLocal: null,
          reason: '이유2',
          reasonTags: [],
          addressKo: '주소A',
          addressEn: 'addr A',
          addressLocal: null,
          latitude: 37.5,
          longitude: 127.0,
        },
      ],
    });

    mockGenerateContent.mockResolvedValue(
      buildGeminiResponse(`\`\`\`json\n${restaurantJson}\n\`\`\``, [
        { maps: { placeId: 'place-dup-1', title: '가게A' } },
      ]),
    );

    const result = await client.searchRestaurantsUnified(
      '맛집',
      37.5,
      127.0,
      'ko',
    );

    expect(result.success).toBe(true);
    const withPlaceId = result.restaurants.filter((r) => r.placeId);
    expect(withPlaceId).toHaveLength(1);
    expect(withPlaceId[0].placeId).toBe('place-dup-1');
  });
});
