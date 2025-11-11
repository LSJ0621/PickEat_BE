import { Test, TestingModule } from '@nestjs/testing';
import { MapController } from './map.controller';
import { MapService } from './map.service';

describe('MapController', () => {
  let controller: MapController;
  const mapService = {
    getRestaurantMarkers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapController],
      providers: [
        {
          provide: MapService,
          useValue: mapService,
        },
      ],
    }).compile();

    controller = module.get<MapController>(MapController);
  });

  it('should return markers from the map service', async () => {
    const dto = { menuName: '피자', latitude: 37.1, longitude: 127.1 };
    const markers = { markers: [] };
    mapService.getRestaurantMarkers.mockResolvedValue(markers);

    await expect(controller.getRestaurantMarkers(dto)).resolves.toEqual(
      markers,
    );
    expect(mapService.getRestaurantMarkers).toHaveBeenCalledWith(dto);
  });
});
