import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: {
            searchRestaurants: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    service = module.get<SearchService>(SearchService);
  });

  it('should delegate restaurant search to the service', async () => {
    const dto = {
      menuName: '떡볶이',
      latitude: 37.5665,
      longitude: 126.978,
    };
    const expected = { restaurants: [] };
    jest.spyOn(service, 'searchRestaurants').mockResolvedValue(expected);

    await expect(controller.searchRestaurants(dto)).resolves.toEqual(expected);
    expect(service.searchRestaurants).toHaveBeenCalledWith(dto);
  });
});
