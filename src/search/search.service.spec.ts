import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  const httpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: HttpService,
          useValue: httpService,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('maps Naver results into restaurant summaries', async () => {
    const dto = {
      menuName: '  마라탕 ',
      latitude: 37.5,
      longitude: 127.0,
    };
    httpService.get.mockReturnValue(
      of({
        data: {
          items: [
            {
              title: '<b>마라탕집</b>',
              address: '서울시 양천구',
              telephone: '010-0000-0000',
              mapx: '1272629785',
              mapy: '37392410',
              distance: '1850',
              link: 'https://naver.me/example',
            },
          ],
        },
      }),
    );

    const result = await service.searchRestaurants(dto);

    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(result.restaurants).toEqual([
      {
        name: '마라탕집',
        address: '서울시 양천구',
        roadAddress: undefined,
        phone: '010-0000-0000',
        mapx: 1272629785,
        mapy: 37392410,
        distance: 1.85,
        link: 'https://naver.me/example',
      },
    ]);
  });

  it('throws when menu name is empty', async () => {
    await expect(
      service.searchRestaurants({
        menuName: '   ',
        latitude: 37.5,
        longitude: 127.0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('wraps Naver API failures', async () => {
    const axiosError = {
      response: {
        status: 401,
        data: { error: 'Invalid client' },
      },
    } as AxiosError;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.searchRestaurants({
        menuName: '떡볶이',
        latitude: 37.5,
        longitude: 127.0,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
