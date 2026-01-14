import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../../user/entities/user.entity';

/**
 * 음식점 검색 로그 엔티티
 * - Google Places API 호출 시 검색 정보를 저장
 * - 검색 키워드, 지역, 결과 수 등 통계 분석용 데이터
 *
 * @note Google API 약관에 따라 placeId 외 음식점 정보는 저장하지 않음
 */
@Entity('place_search_log')
@Index('idx_place_search_log_created_at', ['createdAt'])
@Index('idx_place_search_log_keyword', ['keyword'])
@Index('idx_place_search_log_region', ['region'])
@Index('idx_place_search_log_search_type', ['searchType'])
export class PlaceSearchLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  /** 검색 키워드 (메뉴명) */
  @Column({ type: 'varchar', length: 100 })
  keyword: string;

  /** 검색 위치 - 위도 */
  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  /** 검색 위치 - 경도 */
  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number;

  /** 시/도명 (좌표에서 추출) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  region: string | null;

  /** 검색 결과 수 */
  @Column({ type: 'int', default: 0 })
  resultCount: number;

  /** 검색 타입: places (Google Places), blogs (블로그 검색) */
  @Column({ type: 'varchar', length: 20, default: 'places' })
  searchType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
