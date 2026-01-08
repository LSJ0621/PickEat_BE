import { normalizePlaceIdForStorage } from '../place-id.util';

describe('place-id.util', () => {
  describe('normalizePlaceIdForStorage', () => {
    it('should remove places/ prefix when present', () => {
      const result = normalizePlaceIdForStorage(
        'places/ChIJN1t_tDeuEmsRUsoyG83frY4',
      );

      expect(result).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('should return unchanged placeId when places/ prefix is not present', () => {
      const result = normalizePlaceIdForStorage('ChIJN1t_tDeuEmsRUsoyG83frY4');

      expect(result).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('should return empty string when empty string is provided', () => {
      const result = normalizePlaceIdForStorage('');

      expect(result).toBe('');
    });

    it('should return null when null is provided', () => {
      const result = normalizePlaceIdForStorage(null as any);

      expect(result).toBeNull();
    });

    it('should return undefined when undefined is provided', () => {
      const result = normalizePlaceIdForStorage(undefined as any);

      expect(result).toBeUndefined();
    });

    it('should handle placeId starting with places/ but containing multiple places/ patterns', () => {
      const result = normalizePlaceIdForStorage('places/places/test');

      expect(result).toBe('places/test');
    });

    it('should handle placeId containing places/ in the middle', () => {
      const result = normalizePlaceIdForStorage('ChIJ/places/test');

      expect(result).toBe('ChIJ/places/test');
    });

    it('should handle placeId with only places/ prefix', () => {
      const result = normalizePlaceIdForStorage('places/');

      expect(result).toBe('');
    });
  });
});
