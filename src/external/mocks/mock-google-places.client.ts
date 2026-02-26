import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  GooglePlaceDetails,
  GooglePlaceSearchResult,
  GooglePlacesAutocompleteSuggestion,
} from '../google/google.types';

const mockGooglePlacesResponses = {
  searchSuccess: {
    places: [
      {
        id: 'mock-place-id-1',
        displayName: { text: 'Mock Restaurant 1' },
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
      } as GooglePlaceSearchResult,
    ],
  },
  placeDetailsSuccess: {
    id: 'mock-place-id-1',
    displayName: { text: 'Mock Restaurant 1' },
    formattedAddress: '123 Mock Street, Seoul',
    rating: 4.5,
  } as GooglePlaceDetails,
  photoUri: 'https://mock-photo-uri.example.com/photo.jpg',
};

/**
 * Google Places API Mock 클라이언트
 * E2E 테스트 시 실제 API 호출 대신 사용
 */
@Injectable()
export class MockGooglePlacesClient {
  private readonly logger = new Logger(MockGooglePlacesClient.name);

  createSessionToken(): string {
    return randomUUID();
  }

  async autocomplete(
    input: string,
    _options?: {
      sessionToken?: string;
      languageCode?: string;
      includedRegionCodes?: string[];
    },
  ): Promise<GooglePlacesAutocompleteSuggestion[]> {
    this.logger.log(`[MOCK] Places autocomplete: input="${input}"`);
    return [
      {
        placePrediction: {
          placeId: 'mock-place-id-1',
          text: { text: `${input} - Mock Address 1` },
          structuredFormat: {
            mainText: { text: 'Mock Address 1' },
            secondaryText: { text: 'Seoul, South Korea' },
          },
        },
      },
      {
        placePrediction: {
          placeId: 'mock-place-id-2',
          text: { text: `${input} - Mock Address 2` },
          structuredFormat: {
            mainText: { text: 'Mock Address 2' },
            secondaryText: { text: 'Busan, South Korea' },
          },
        },
      },
    ];
  }

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
    _options?: {
      includeBusinessStatus?: boolean;
      languageCode?: string;
      sessionToken?: string;
    },
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
