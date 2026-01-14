import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceSearchLog } from '../entities/place-search-log.entity';

export interface CreatePlaceSearchLogData {
  userId?: string | null;
  keyword: string;
  latitude: number;
  longitude: number;
  region?: string | null;
  resultCount: number;
  searchType?: string;
}

@Injectable()
export class PlaceSearchLogService {
  private readonly logger = new Logger(PlaceSearchLogService.name);

  constructor(
    @InjectRepository(PlaceSearchLog)
    private readonly placeSearchLogRepository: Repository<PlaceSearchLog>,
  ) {}

  /**
   * 음식점 검색 로그를 저장합니다.
   * @param data 검색 로그 데이터
   * @returns 생성된 검색 로그 엔티티
   */
  async createLog(data: CreatePlaceSearchLogData): Promise<PlaceSearchLog> {
    const log = this.placeSearchLogRepository.create({
      userId: data.userId ?? null,
      keyword: data.keyword,
      latitude: data.latitude,
      longitude: data.longitude,
      region: data.region ?? null,
      resultCount: data.resultCount,
      searchType: data.searchType ?? 'places',
    });

    const savedLog = await this.placeSearchLogRepository.save(log);
    this.logger.debug(
      `Search log created: keyword=${data.keyword}, region=${data.region}, resultCount=${data.resultCount}`,
    );

    return savedLog;
  }

  /**
   * 여러 검색 로그를 일괄 저장합니다.
   * @param dataList 검색 로그 데이터 배열
   * @returns 생성된 검색 로그 엔티티 배열
   */
  async createLogs(
    dataList: CreatePlaceSearchLogData[],
  ): Promise<PlaceSearchLog[]> {
    const logs = dataList.map((data) =>
      this.placeSearchLogRepository.create({
        userId: data.userId ?? null,
        keyword: data.keyword,
        latitude: data.latitude,
        longitude: data.longitude,
        region: data.region ?? null,
        resultCount: data.resultCount,
        searchType: data.searchType ?? 'places',
      }),
    );

    const savedLogs = await this.placeSearchLogRepository.save(logs);
    this.logger.debug(`Batch search logs created: count=${savedLogs.length}`);

    return savedLogs;
  }
}
