import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from '../search/search.service';
import { MapService } from './map.service';

describe('MapService', () => {
  let service: MapService;
  const searchService = {
    searchRestaurants: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapService,
        {
          provide: SearchService,
          useValue: searchService,
        },
      ],
    }).compile();

    service = module.get<MapService>(MapService);
  });

  it('converts search results into marker responses', async () => {
    const dto = { menuName: '국밥', latitude: 35.0, longitude: 129.0 };
    searchService.searchRestaurants.mockResolvedValue({
      restaurants: [
        {
          name: '국밥집',
          address: '부산시 진구',
          roadAddress: '부산시 진구 어딘가',
          phone: '051-000-0000',
          mapx: 123,
          mapy: 456,
          distance: 2.1,
          link: 'https://naver.me/abc',
        },
      ],
    });

    await expect(service.getRestaurantMarkers(dto)).resolves.toEqual({
      markers: [
        {
          name: '국밥집',
          address: '부산시 진구',
          roadAddress: '부산시 진구 어딘가',
          phone: '051-000-0000',
          mapx: 123,
          mapy: 456,
          distance: 2.1,
          link: 'https://naver.me/abc',
        },
      ],
    });
  });
});
