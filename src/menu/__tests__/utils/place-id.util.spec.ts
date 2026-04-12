import { normalizePlaceId, parseUserPlaceId } from '../../utils/place-id.util';

describe('place-id.util', () => {
  describe('normalizePlaceId', () => {
    it('"places/" 프리픽스가 있으면 제거한다', () => {
      expect(normalizePlaceId('places/ChIJabc123')).toBe('ChIJabc123');
    });

    it('프리픽스가 없으면 입력값을 그대로 반환한다', () => {
      expect(normalizePlaceId('ChIJabc123')).toBe('ChIJabc123');
    });
  });

  describe('parseUserPlaceId', () => {
    it('"user_place_123" → 123 숫자 반환', () => {
      expect(parseUserPlaceId('user_place_123')).toBe(123);
    });

    it('prefix가 없으면 null 반환', () => {
      expect(parseUserPlaceId('place_123')).toBeNull();
      expect(parseUserPlaceId('ChIJabc')).toBeNull();
    });

    it('prefix 뒤가 숫자가 아니면 null 반환', () => {
      expect(parseUserPlaceId('user_place_abc')).toBeNull();
    });
  });
});
