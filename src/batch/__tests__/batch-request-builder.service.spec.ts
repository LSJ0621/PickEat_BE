import { BatchRequestBuilderService } from '../services/batch-request-builder.service';

describe('BatchRequestBuilderService', () => {
  let service: BatchRequestBuilderService;

  beforeEach(() => {
    // buildOpenAiBatchRequests는 순수 변환 함수이므로 의존성 없이 테스트 가능
    service = Object.create(BatchRequestBuilderService.prototype);
  });

  describe('buildOpenAiBatchRequests', () => {
    it('PreferenceBatchRequest를 OpenAI BatchRequest 형식으로 변환한다', () => {
      const requests = [
        {
          customId: 'pref_1_10,11',
          userId: 1,
          selectionIds: [10, 11],
          systemPrompt: 'You are a food analyst.',
          userPrompt: 'Analyze these selections.',
        },
      ];

      const result = service.buildOpenAiBatchRequests(requests, 'gpt-4o-mini');

      expect(result).toHaveLength(1);
      expect(result[0].custom_id).toBe('pref_1_10,11');
      expect(result[0].method).toBe('POST');
      expect(result[0].url).toBe('/v1/chat/completions');
      expect(result[0].body.model).toBe('gpt-4o-mini');
      expect(result[0].body.messages).toHaveLength(2);
      expect(result[0].body.messages[0].role).toBe('system');
      expect(result[0].body.messages[1].role).toBe('user');
    });

    it('response_format에 json_schema가 포함된다', () => {
      const requests = [
        {
          customId: 'pref_1_1',
          userId: 1,
          selectionIds: [1],
          systemPrompt: 'sys',
          userPrompt: 'usr',
        },
      ];

      const result = service.buildOpenAiBatchRequests(requests, 'gpt-4o-mini');

      expect(result[0].body.response_format?.type).toBe('json_schema');
      expect(result[0].body.response_format?.json_schema.name).toBe('preference_analysis');
      expect(result[0].body.response_format?.json_schema.strict).toBe(true);
    });

    it('빈 요청 배열이면 빈 결과를 반환한다', () => {
      const result = service.buildOpenAiBatchRequests([], 'gpt-4o-mini');

      expect(result).toHaveLength(0);
    });

    it('여러 요청을 한 번에 변환한다', () => {
      const requests = [
        {
          customId: 'pref_1_1',
          userId: 1,
          selectionIds: [1],
          systemPrompt: 'sys1',
          userPrompt: 'usr1',
        },
        {
          customId: 'pref_2_2,3',
          userId: 2,
          selectionIds: [2, 3],
          systemPrompt: 'sys2',
          userPrompt: 'usr2',
        },
      ];

      const result = service.buildOpenAiBatchRequests(requests, 'gpt-5.1');

      expect(result).toHaveLength(2);
      expect(result[0].body.model).toBe('gpt-5.1');
      expect(result[1].custom_id).toBe('pref_2_2,3');
      expect(result[1].body.messages[1].content).toBe('usr2');
    });

    it('각 요청에 max_completion_tokens가 포함된다', () => {
      const requests = [
        {
          customId: 'pref_1_1',
          userId: 1,
          selectionIds: [1],
          systemPrompt: 'sys',
          userPrompt: 'usr',
        },
      ];

      const result = service.buildOpenAiBatchRequests(requests, 'gpt-4o-mini');

      expect(result[0].body.max_completion_tokens).toBeDefined();
      expect(typeof result[0].body.max_completion_tokens).toBe('number');
    });
  });

  describe('mapPreferredLanguage (via private)', () => {
    it('en을 en으로 매핑한다', () => {
      // Private 메서드 접근
      const mapLang = (service as unknown as { mapPreferredLanguage: (lang?: string) => string | undefined }).mapPreferredLanguage;
      expect(mapLang('en')).toBe('en');
    });

    it('ko를 ko로 매핑한다', () => {
      const mapLang = (service as unknown as { mapPreferredLanguage: (lang?: string) => string | undefined }).mapPreferredLanguage;
      expect(mapLang('ko')).toBe('ko');
    });

    it('undefined이면 undefined를 반환한다', () => {
      const mapLang = (service as unknown as { mapPreferredLanguage: (lang?: string) => string | undefined }).mapPreferredLanguage;
      expect(mapLang(undefined)).toBeUndefined();
    });

    it('기타 언어는 ko로 매핑한다', () => {
      const mapLang = (service as unknown as { mapPreferredLanguage: (lang?: string) => string | undefined }).mapPreferredLanguage;
      expect(mapLang('ja')).toBe('ko');
    });
  });

  describe('findRepeatedMenus (via private)', () => {
    it('2회 이상 반복된 메뉴를 반환한다', () => {
      const findRepeated = (service as unknown as { findRepeatedMenus: (selections: Array<{ menuPayload: unknown }>) => Array<{ menu: string; count: number }> }).findRepeatedMenus;

      const selections = [
        { menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] } },
        { menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: ['삼겹살'], etc: [] } },
        { menuPayload: { breakfast: [], lunch: ['된장찌개'], dinner: ['삼겹살'], etc: [] } },
      ];

      const result = findRepeated(selections);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ menu: '김치찌개', count: 2 }),
          expect.objectContaining({ menu: '삼겹살', count: 2 }),
        ]),
      );
    });

    it('빈 selections이면 빈 배열을 반환한다', () => {
      const findRepeated = (service as unknown as { findRepeatedMenus: (selections: Array<{ menuPayload: unknown }>) => Array<{ menu: string; count: number }> }).findRepeatedMenus;
      expect(findRepeated([])).toEqual([]);
    });
  });
});
