import { normalizePlaceId, parseUserPlaceId } from '../utils/place-id.util';

describe('place-id.util', () => {
  describe('normalizePlaceId', () => {
    it('should remove places/ prefix when present', () => {
      const result = normalizePlaceId('places/ChIJN1t_tDeuEmsRUsoyG83frY4');

      expect(result).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('should return unchanged placeId when places/ prefix is not present', () => {
      const result = normalizePlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4');

      expect(result).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('should return empty string when empty string is provided', () => {
      const result = normalizePlaceId('');

      expect(result).toBe('');
    });

    it('should handle placeId starting with places/ but containing multiple places/ patterns', () => {
      const result = normalizePlaceId('places/places/test');

      expect(result).toBe('places/test');
    });

    it('should handle placeId containing places/ in the middle', () => {
      const result = normalizePlaceId('ChIJ/places/test');

      expect(result).toBe('ChIJ/places/test');
    });

    it('should handle placeId with only places/ prefix', () => {
      const result = normalizePlaceId('places/');

      expect(result).toBe('');
    });
  });

  describe('parseUserPlaceId', () => {
    it('should extract numeric ID from user_place_123 format', () => {
      const result = parseUserPlaceId('user_place_123');

      expect(result).toBe(123);
    });

    it('should extract zero from user_place_0 format', () => {
      const result = parseUserPlaceId('user_place_0');

      expect(result).toBe(0);
    });

    it('should extract large numeric ID from user_place format', () => {
      const result = parseUserPlaceId('user_place_999999');

      expect(result).toBe(999999);
    });

    it('should return null for Google Place ID', () => {
      const result = parseUserPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4');

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseUserPlaceId('');

      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = parseUserPlaceId(null as any);

      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = parseUserPlaceId(undefined as any);

      expect(result).toBeNull();
    });

    it('should return null when user_place_ prefix is followed by no digits', () => {
      const result = parseUserPlaceId('user_place_');

      expect(result).toBeNull();
    });

    it('should return null when user_place_ prefix is followed by non-numeric text', () => {
      const result = parseUserPlaceId('user_place_abc');

      expect(result).toBeNull();
    });

    it('should extract numeric ID even when followed by non-numeric text', () => {
      // parseInt('123abc', 10) returns 123, so this is the actual behavior
      const result = parseUserPlaceId('user_place_123abc');

      expect(result).toBe(123);
    });

    it('should return null for partial prefix match', () => {
      const result = parseUserPlaceId('user_place123');

      expect(result).toBeNull();
    });

    it('should return null for wrong prefix', () => {
      const result = parseUserPlaceId('user_123');

      expect(result).toBeNull();
    });
  });
});
