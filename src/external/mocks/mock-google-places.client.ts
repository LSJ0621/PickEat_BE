import { Injectable, Logger } from '@nestjs/common';
import {
  GooglePlaceDetails,
  GooglePlaceSearchResult,
} from '../google/google.types';
import { mockGooglePlacesResponses } from './fixtures';

/**
 * Google Places API Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockGooglePlacesClient {
  private readonly logger = new Logger(MockGooglePlacesClient.name);

  async searchByText(
    query: string,
    options?: { maxResults?: number; languageCode?: string },
  ): Promise<GooglePlaceSearchResult[]> {
    this.logger.log(`[MOCK] Places searchByText: query="${query}"`);
    const places = mockGooglePlacesResponses.searchSuccess.places;
    const maxResults = options?.maxResults ?? places.length;
    return places.slice(0, maxResults);
  }

  async getDetails(
    placeId: string,
    _options?: { includeBusinessStatus?: boolean },
  ): Promise<GooglePlaceDetails | null> {
    this.logger.log(`[MOCK] Places getDetails: placeId="${placeId}"`);
    return {
      ...mockGooglePlacesResponses.placeDetailsSuccess,
      id: placeId,
    } as GooglePlaceDetails;
  }

  async getPhotoUri(
    photoName: string,
    _options?: { maxWidth?: number; maxHeight?: number },
  ): Promise<string | null> {
    this.logger.log(`[MOCK] Places getPhotoUri: photoName="${photoName}"`);
    return mockGooglePlacesResponses.photoUri;
  }

  async resolvePhotoUris(
    photos: Array<{ name?: string }> | null | undefined,
    _options?: { maxWidth?: number; maxHeight?: number },
  ): Promise<string[]> {
    if (!photos || photos.length === 0) {
      return [];
    }
    this.logger.log(`[MOCK] Places resolvePhotoUris: count=${photos.length}`);
    return photos.map(() => mockGooglePlacesResponses.photoUri);
  }
}
