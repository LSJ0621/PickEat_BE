import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { GoogleSearchClient } from '../../clients/google-search.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { ConfigMissingException } from '@/common/exceptions/config-missing.exception';
import { SEARCH_DEFAULTS } from '@/common/constants/business.constants';
import { GOOGLE_CSE_CONFIG } from '../../google.constants';
import { GoogleCseResponse } from '../../google.types';

describe('GoogleSearchClient', () => {
  let client: GoogleSearchClient;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const mockConfig = {
    GOOGLE_API_KEY: 'test-api-key',
    GOOGLE_CSE_CX: 'test-cx',
    APP_URL: 'http://localhost:3000',
  };

  beforeEach(async () => {
    mockHttpService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    mockConfigService = {
      get: jest.fn((key: string) => mockConfig[key as keyof typeof mockConfig]),
      getOrThrow: jest.fn((key: string) => {
        const value = mockConfig[key as keyof typeof mockConfig];
        if (!value) throw new Error(`Missing ${key}`);
        return value;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSearchClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    client = module.get<GoogleSearchClient>(GoogleSearchClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with API key and CSE CX', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('GOOGLE_API_KEY', '');
      expect(mockConfigService.get).toHaveBeenCalledWith('GOOGLE_CSE_CX', '');
      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('APP_URL');
    });
  });

  describe('searchBlogs', () => {
    const query = '강남역 맛집';
    const exactTerms = '맛있는 식당';

    const mockCseResponse: GoogleCseResponse = {
      items: [
        {
          title: '맛집 리뷰',
          link: 'https://blog.example.com/post1',
          snippet: '정말 맛있는 식당이에요',
          pagemap: {
            cse_thumbnail: [{ src: 'https://example.com/thumb.jpg' }],
            metatags: [{ 'og:site_name': 'Example Blog' }],
          },
          displayLink: 'blog.example.com',
        },
        {
          title: '강남 맛집 추천',
          link: 'https://blog.example.com/post2',
          snippet: '강남역 근처 추천 식당',
          pagemap: {
            metatags: [{ 'og:image': 'https://example.com/image.jpg' }],
          },
          displayLink: 'blog.example.com',
        },
      ],
    };

    it('should search blogs successfully with default parameters', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      const result = await client.searchBlogs(query, exactTerms);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        GOOGLE_CSE_CONFIG.BASE_URL,
        {
          params: {
            key: mockConfig.GOOGLE_API_KEY,
            cx: mockConfig.GOOGLE_CSE_CX,
            q: query,
            exactTerms: exactTerms,
            num: SEARCH_DEFAULTS.GOOGLE_CSE_NUM_RESULTS,
            hl: GOOGLE_CSE_CONFIG.DEFAULTS.LANGUAGE,
          },
          headers: {
            Referer: mockConfig.APP_URL,
          },
          timeout: 10000,
        },
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: '맛집 리뷰',
        url: 'https://blog.example.com/post1',
        snippet: '정말 맛있는 식당이에요',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        source: 'Example Blog',
      });
      expect(result[1]).toEqual({
        title: '강남 맛집 추천',
        url: 'https://blog.example.com/post2',
        snippet: '강남역 근처 추천 식당',
        thumbnailUrl: 'https://example.com/image.jpg',
        source: 'blog.example.com',
      });
    });

    it('should include lr parameter when provided', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      await client.searchBlogs(query, exactTerms, { lr: 'lang_ko' });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        GOOGLE_CSE_CONFIG.BASE_URL,
        expect.objectContaining({
          params: expect.objectContaining({
            lr: 'lang_ko',
          }),
        }),
      );
    });

    it('should override hl parameter when provided', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      await client.searchBlogs(query, exactTerms, { hl: 'en' });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        GOOGLE_CSE_CONFIG.BASE_URL,
        expect.objectContaining({
          params: expect.objectContaining({
            hl: 'en',
          }),
        }),
      );
    });

    it('should pass both lr and hl parameters when provided', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      await client.searchBlogs(query, exactTerms, {
        lr: 'lang_en',
        hl: 'en',
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        GOOGLE_CSE_CONFIG.BASE_URL,
        expect.objectContaining({
          params: expect.objectContaining({
            lr: 'lang_en',
            hl: 'en',
          }),
        }),
      );
    });

    it('should use custom numResults when provided', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      await client.searchBlogs(query, exactTerms, { numResults: 5 });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        GOOGLE_CSE_CONFIG.BASE_URL,
        expect.objectContaining({
          params: expect.objectContaining({
            num: 5,
          }),
        }),
      );
    });

    it('should not include lr parameter when not provided', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      await client.searchBlogs(query, exactTerms);

      const callParams = mockHttpService.get.mock.calls[0][1]?.params;
      expect(callParams).not.toHaveProperty('lr');
    });

    it('should handle empty items array', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } } as any));

      const result = await client.searchBlogs(query, exactTerms);

      expect(result).toEqual([]);
    });

    it('should handle missing items property', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} } as any));

      const result = await client.searchBlogs(query, exactTerms);

      expect(result).toEqual([]);
    });

    it('should throw ConfigMissingException when API key is missing', async () => {
      const noKeyClient = new GoogleSearchClient(mockHttpService, {
        get: jest.fn().mockReturnValue(''),
        getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
      } as unknown as jest.Mocked<ConfigService>);

      await expect(noKeyClient.searchBlogs(query, exactTerms)).rejects.toThrow(
        ConfigMissingException,
      );

      try {
        await noKeyClient.searchBlogs(query, exactTerms);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigMissingException);
      }
    });

    it('should throw ConfigMissingException when CSE CX is missing', async () => {
      const noCxClient = new GoogleSearchClient(mockHttpService, {
        get: jest.fn((key: string) =>
          key === 'GOOGLE_API_KEY' ? 'test-key' : '',
        ),
        getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
      } as unknown as jest.Mocked<ConfigService>);

      await expect(noCxClient.searchBlogs(query, exactTerms)).rejects.toThrow(
        ConfigMissingException,
      );
    });

    it('should throw ExternalApiException on HTTP error', async () => {
      const httpError = {
        response: {
          status: 403,
          data: { error: 'Forbidden' },
        },
        message: 'Request failed with status code 403',
      };

      mockHttpService.get.mockReturnValue(throwError(() => httpError));

      await expect(client.searchBlogs(query, exactTerms)).rejects.toThrow(
        ExternalApiException,
      );

      try {
        await client.searchBlogs(query, exactTerms);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalApiException);
      }
    });

    it('should handle non-axios error objects', async () => {
      const genericError = new Error('Network error');
      mockHttpService.get.mockReturnValue(throwError(() => genericError));

      await expect(client.searchBlogs(query, exactTerms)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should handle items with missing optional fields', async () => {
      const minimalResponse: GoogleCseResponse = {
        items: [
          {
            title: undefined,
            link: undefined,
            snippet: undefined,
            pagemap: undefined,
            displayLink: undefined,
          },
        ],
      };

      mockHttpService.get.mockReturnValue(of({ data: minimalResponse } as any));

      const result = await client.searchBlogs(query, exactTerms);

      expect(result).toEqual([
        {
          title: null,
          url: null,
          snippet: null,
          thumbnailUrl: null,
          source: null,
        },
      ]);
    });

    it('should prefer cse_thumbnail over og:image', async () => {
      const responseWithBothThumbnails: GoogleCseResponse = {
        items: [
          {
            title: 'Test',
            link: 'https://example.com',
            snippet: 'Test snippet',
            pagemap: {
              cse_thumbnail: [{ src: 'https://example.com/thumb.jpg' }],
              metatags: [{ 'og:image': 'https://example.com/og-image.jpg' }],
            },
            displayLink: 'example.com',
          },
        ],
      };

      mockHttpService.get.mockReturnValue(
        of({ data: responseWithBothThumbnails } as any),
      );

      const result = await client.searchBlogs(query, exactTerms);

      expect(result[0].thumbnailUrl).toBe('https://example.com/thumb.jpg');
    });

    it('should prefer og:site_name over displayLink for source', async () => {
      const responseWithSiteName: GoogleCseResponse = {
        items: [
          {
            title: 'Test',
            link: 'https://example.com',
            snippet: 'Test snippet',
            pagemap: {
              metatags: [{ 'og:site_name': 'Example Site' }],
            },
            displayLink: 'example.com',
          },
        ],
      };

      mockHttpService.get.mockReturnValue(
        of({ data: responseWithSiteName } as any),
      );

      const result = await client.searchBlogs(query, exactTerms);

      expect(result[0].source).toBe('Example Site');
    });

    it('should log request and completion', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockCseResponse } as any));

      const loggerSpy = jest.spyOn(client['logger'], 'log');

      await client.searchBlogs(query, exactTerms);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CSE 블로그 검색]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CSE 블로그 검색 완료]'),
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('API error');
      mockHttpService.get.mockReturnValue(throwError(() => error));

      const loggerErrorSpy = jest.spyOn(client['logger'], 'error');

      await expect(client.searchBlogs(query, exactTerms)).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CSE 블로그 검색 에러]'),
      );
    });

    it('should log error data when available', async () => {
      const httpError = {
        response: {
          status: 400,
          data: { error: { message: 'Invalid query' } },
        },
        message: 'Bad Request',
      };

      mockHttpService.get.mockReturnValue(throwError(() => httpError));

      const loggerErrorSpy = jest.spyOn(client['logger'], 'error');

      await expect(client.searchBlogs(query, exactTerms)).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('에러 상세:'),
      );
    });
  });

  describe('mapCseItemToBlogResult', () => {
    it('should map CSE item with all fields', () => {
      const item = {
        title: '맛집 리뷰',
        link: 'https://blog.example.com/post',
        snippet: '맛있는 식당입니다',
        pagemap: {
          cse_thumbnail: [{ src: 'https://example.com/thumb.jpg' }],
          metatags: [{ 'og:site_name': 'Example Blog' }],
        },
        displayLink: 'blog.example.com',
      };

      const result = client['mapCseItemToBlogResult'](item);

      expect(result).toEqual({
        title: '맛집 리뷰',
        url: 'https://blog.example.com/post',
        snippet: '맛있는 식당입니다',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        source: 'Example Blog',
      });
    });

    it('should handle empty pagemap', () => {
      const item = {
        title: '맛집 리뷰',
        link: 'https://blog.example.com/post',
        snippet: '맛있는 식당입니다',
        pagemap: {},
        displayLink: 'blog.example.com',
      };

      const result = client['mapCseItemToBlogResult'](item);

      expect(result.thumbnailUrl).toBeNull();
      expect(result.source).toBe('blog.example.com');
    });

    it('should handle missing pagemap', () => {
      const item = {
        title: '맛집 리뷰',
        link: 'https://blog.example.com/post',
        snippet: '맛있는 식당입니다',
        displayLink: 'blog.example.com',
      };

      const result = client['mapCseItemToBlogResult'](item);

      expect(result.thumbnailUrl).toBeNull();
      expect(result.source).toBe('blog.example.com');
    });
  });
});
