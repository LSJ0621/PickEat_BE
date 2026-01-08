import {
  normalizeMenuName,
  buildMenuPayloadFromSlotInputs,
  mergeMenuPayload,
  normalizeMenuPayload,
} from '../menu-payload.util';
import {
  MenuSlotPayload,
  SlotMenuInput,
} from '../interface/menu-selection.interface';

describe('menu-payload.util', () => {
  describe('normalizeMenuName', () => {
    it('should return trimmed string when valid name is provided', () => {
      expect(normalizeMenuName('김치찌개')).toBe('김치찌개');
    });

    it('should trim whitespace from both ends', () => {
      expect(normalizeMenuName('  된장찌개  ')).toBe('된장찌개');
      expect(normalizeMenuName('\t비빔밥\n')).toBe('비빔밥');
    });

    it('should return empty string when null is provided', () => {
      expect(normalizeMenuName(null)).toBe('');
    });

    it('should return empty string when undefined is provided', () => {
      expect(normalizeMenuName(undefined)).toBe('');
    });

    it('should return empty string when empty string is provided', () => {
      expect(normalizeMenuName('')).toBe('');
    });

    it('should return empty string when only whitespace is provided', () => {
      expect(normalizeMenuName('   ')).toBe('');
      expect(normalizeMenuName('\t\n')).toBe('');
    });
  });

  describe('buildMenuPayloadFromSlotInputs', () => {
    it('should return empty payload when empty array is provided', () => {
      const result = buildMenuPayloadFromSlotInputs([]);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should build payload for breakfast slot', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'breakfast', name: '토스트' },
        { slot: 'breakfast', name: '시리얼' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual(['토스트', '시리얼']);
      expect(result.lunch).toEqual([]);
      expect(result.dinner).toEqual([]);
      expect(result.etc).toEqual([]);
    });

    it('should build payload for lunch slot', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'lunch', name: '김치찌개' },
        { slot: 'lunch', name: '된장찌개' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual([]);
      expect(result.lunch).toEqual(['김치찌개', '된장찌개']);
      expect(result.dinner).toEqual([]);
      expect(result.etc).toEqual([]);
    });

    it('should build payload for dinner slot', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'dinner', name: '삼겹살' },
        { slot: 'dinner', name: '갈비' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual([]);
      expect(result.lunch).toEqual([]);
      expect(result.dinner).toEqual(['삼겹살', '갈비']);
      expect(result.etc).toEqual([]);
    });

    it('should build payload for etc slot', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'etc', name: '커피' },
        { slot: 'etc', name: '케이크' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual([]);
      expect(result.lunch).toEqual([]);
      expect(result.dinner).toEqual([]);
      expect(result.etc).toEqual(['커피', '케이크']);
    });

    it('should handle multiple slots in single input', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'breakfast', name: '토스트' },
        { slot: 'lunch', name: '김치찌개' },
        { slot: 'dinner', name: '삼겹살' },
        { slot: 'etc', name: '커피' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual(['토스트']);
      expect(result.lunch).toEqual(['김치찌개']);
      expect(result.dinner).toEqual(['삼겹살']);
      expect(result.etc).toEqual(['커피']);
    });

    it('should handle case-insensitive slot names', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'BREAKFAST', name: '토스트' },
        { slot: 'Lunch', name: '김치찌개' },
        { slot: 'DiNnEr', name: '삼겹살' },
        { slot: 'ETC', name: '커피' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual(['토스트']);
      expect(result.lunch).toEqual(['김치찌개']);
      expect(result.dinner).toEqual(['삼겹살']);
      expect(result.etc).toEqual(['커피']);
    });

    it('should remove duplicates in same slot', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'lunch', name: '김치찌개' },
        { slot: 'lunch', name: '김치찌개' },
        { slot: 'lunch', name: '된장찌개' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.lunch).toEqual(['김치찌개', '된장찌개']);
    });

    it('should skip items with empty/whitespace names', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'lunch', name: '김치찌개' },
        { slot: 'lunch', name: '' },
        { slot: 'lunch', name: '   ' },
        { slot: 'lunch', name: '된장찌개' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.lunch).toEqual(['김치찌개', '된장찌개']);
    });

    it('should trim whitespace from menu names', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'lunch', name: '  김치찌개  ' },
        { slot: 'lunch', name: '\t된장찌개\n' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.lunch).toEqual(['김치찌개', '된장찌개']);
    });

    it('should ignore unknown slot names', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'breakfast', name: '토스트' },
        { slot: 'unknown', name: '알수없음' },
        { slot: 'invalid', name: '무효' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.breakfast).toEqual(['토스트']);
      expect(result.lunch).toEqual([]);
      expect(result.dinner).toEqual([]);
      expect(result.etc).toEqual([]);
    });

    it('should preserve duplicates after trimming when they become identical', () => {
      const inputs: SlotMenuInput[] = [
        { slot: 'lunch', name: '김치찌개' },
        { slot: 'lunch', name: ' 김치찌개 ' },
      ];

      const result = buildMenuPayloadFromSlotInputs(inputs);

      expect(result.lunch).toEqual(['김치찌개']);
    });
  });

  describe('mergeMenuPayload', () => {
    it('should merge two empty payloads', () => {
      const existing: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should merge breakfast items without duplicates', () => {
      const existing: MenuSlotPayload = {
        breakfast: ['토스트', '시리얼'],
        lunch: [],
        dinner: [],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: ['시리얼', '샌드위치'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result.breakfast).toHaveLength(3);
      expect(result.breakfast).toContain('토스트');
      expect(result.breakfast).toContain('시리얼');
      expect(result.breakfast).toContain('샌드위치');
    });

    it('should merge lunch items without duplicates', () => {
      const existing: MenuSlotPayload = {
        breakfast: [],
        lunch: ['김치찌개', '된장찌개'],
        dinner: [],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: [],
        lunch: ['된장찌개', '비빔밥'],
        dinner: [],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result.lunch).toHaveLength(3);
      expect(result.lunch).toContain('김치찌개');
      expect(result.lunch).toContain('된장찌개');
      expect(result.lunch).toContain('비빔밥');
    });

    it('should merge dinner items without duplicates', () => {
      const existing: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: ['삼겹살', '갈비'],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: ['갈비', '치킨'],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result.dinner).toHaveLength(3);
      expect(result.dinner).toContain('삼겹살');
      expect(result.dinner).toContain('갈비');
      expect(result.dinner).toContain('치킨');
    });

    it('should merge etc items without duplicates', () => {
      const existing: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: ['커피', '케이크'],
      };
      const incoming: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: ['케이크', '쿠키'],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result.etc).toHaveLength(3);
      expect(result.etc).toContain('커피');
      expect(result.etc).toContain('케이크');
      expect(result.etc).toContain('쿠키');
    });

    it('should merge all slots simultaneously', () => {
      const existing: MenuSlotPayload = {
        breakfast: ['토스트'],
        lunch: ['김치찌개'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      };
      const incoming: MenuSlotPayload = {
        breakfast: ['시리얼'],
        lunch: ['된장찌개'],
        dinner: ['갈비'],
        etc: ['케이크'],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result.breakfast).toEqual(['토스트', '시리얼']);
      expect(result.lunch).toEqual(['김치찌개', '된장찌개']);
      expect(result.dinner).toEqual(['삼겹살', '갈비']);
      expect(result.etc).toEqual(['커피', '케이크']);
    });

    it('should handle existing payload with items and empty incoming payload', () => {
      const existing: MenuSlotPayload = {
        breakfast: ['토스트'],
        lunch: ['김치찌개'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      };
      const incoming: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result).toEqual(existing);
    });

    it('should handle empty existing payload and incoming payload with items', () => {
      const existing: MenuSlotPayload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: ['토스트'],
        lunch: ['김치찌개'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      };

      const result = mergeMenuPayload(existing, incoming);

      expect(result).toEqual(incoming);
    });

    it('should preserve order when merging (existing items first)', () => {
      const existing: MenuSlotPayload = {
        breakfast: ['A', 'B'],
        lunch: [],
        dinner: [],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: ['C', 'D'],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      // Set preserves insertion order
      expect(result.breakfast).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should handle large number of items', () => {
      const existing: MenuSlotPayload = {
        breakfast: Array.from({ length: 100 }, (_, i) => `item${i}`),
        lunch: [],
        dinner: [],
        etc: [],
      };
      const incoming: MenuSlotPayload = {
        breakfast: Array.from({ length: 100 }, (_, i) => `item${i + 50}`),
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = mergeMenuPayload(existing, incoming);

      // 0-49 (50 items) + 50-99 (50 items) + 100-149 (50 items) = 150 unique items
      expect(result.breakfast).toHaveLength(150);
      expect(new Set(result.breakfast).size).toBe(150); // All unique
    });
  });

  describe('normalizeMenuPayload', () => {
    it('should return valid payload when valid structure is provided', () => {
      const payload = {
        breakfast: ['토스트'],
        lunch: ['김치찌개'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual(payload);
    });

    it('should return empty payload when null is provided', () => {
      const result = normalizeMenuPayload(null);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when undefined is provided', () => {
      const result = normalizeMenuPayload(undefined);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when non-object is provided', () => {
      expect(normalizeMenuPayload('string')).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });

      expect(normalizeMenuPayload(123)).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });

      expect(normalizeMenuPayload(true)).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when empty object is provided', () => {
      const result = normalizeMenuPayload({});

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when breakfast is not an array', () => {
      const payload = {
        breakfast: 'not an array',
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when lunch is not an array', () => {
      const payload = {
        breakfast: [],
        lunch: 'not an array',
        dinner: [],
        etc: [],
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when dinner is not an array', () => {
      const payload = {
        breakfast: [],
        lunch: [],
        dinner: 123,
        etc: [],
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when etc is not an array', () => {
      const payload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: { invalid: true },
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when multiple fields are invalid', () => {
      const payload = {
        breakfast: 'invalid',
        lunch: 123,
        dinner: null,
        etc: undefined,
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return empty payload when some fields are missing', () => {
      const payload = {
        breakfast: [],
        lunch: [],
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should handle array payload', () => {
      const result = normalizeMenuPayload([]);

      expect(result).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should return valid payload with empty arrays', () => {
      const payload = {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: [],
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual(payload);
    });

    it('should accept payload with non-string array elements', () => {
      // The function doesn't validate array contents, just structure
      const payload = {
        breakfast: [1, 2, 3],
        lunch: [true, false],
        dinner: [null, undefined],
        etc: [{}, {}],
      };

      const result = normalizeMenuPayload(payload);

      // Should accept it since arrays are arrays
      expect(result).toEqual(payload);
    });

    it('should handle payload with extra properties', () => {
      const payload = {
        breakfast: ['토스트'],
        lunch: ['김치찌개'],
        dinner: ['삼겹살'],
        etc: ['커피'],
        extraField: 'should be ignored',
      };

      const result = normalizeMenuPayload(payload);

      expect(result).toEqual({
        breakfast: ['토스트'],
        lunch: ['김치찌개'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      });
    });
  });
});
