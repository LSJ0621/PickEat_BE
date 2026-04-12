import { RatingSchedulerService } from '../services/rating-scheduler.service';

describe('RatingSchedulerService', () => {
  describe('buildBulkUpdateClauses', () => {
    let service: RatingSchedulerService;

    beforeEach(() => {
      service = Object.create(RatingSchedulerService.prototype);
    });

    it('단일 업데이트 항목에 대해 올바른 CASE 절과 파라미터를 생성한다', () => {
      const updates = [{ id: 1, avgRating: 4.5, ratingCount: 10 }];

      const result = (service as any).buildBulkUpdateClauses(updates);

      expect(result.avgRatingCases).toContain('WHEN');
      expect(result.ratingCountCases).toContain('WHEN');
      expect(result.idPlaceholders).toContain('$');
      expect(result.parameters).toContain(1);
      expect(result.parameters).toContain(4.5);
      expect(result.parameters).toContain(10);
    });

    it('복수 업데이트 항목에 대해 파라미터 인덱스가 순차적으로 증가한다', () => {
      const updates = [
        { id: 1, avgRating: 4.5, ratingCount: 10 },
        { id: 2, avgRating: 3.8, ratingCount: 5 },
      ];

      const result = (service as any).buildBulkUpdateClauses(updates);

      // 2개 항목: avgRating(2*2) + ratingCount(2*2) + ids(2) = 10 파라미터
      expect(result.parameters).toHaveLength(10);
      // 모든 id가 파라미터에 포함
      expect(result.parameters).toContain(1);
      expect(result.parameters).toContain(2);
    });

    it('빈 배열이면 빈 절과 빈 파라미터를 반환한다', () => {
      const result = (service as any).buildBulkUpdateClauses([]);

      expect(result.avgRatingCases).toBe('');
      expect(result.ratingCountCases).toBe('');
      expect(result.idPlaceholders).toBe('');
      expect(result.parameters).toHaveLength(0);
    });
  });
});
