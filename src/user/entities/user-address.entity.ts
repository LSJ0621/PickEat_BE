import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_address')
@Index('idx_user_address_default', ['user', 'isDefault'])
@Index('idx_user_address_search', ['user', 'isSearchAddress'])
export class UserAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.addresses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  user: User;

  @Column({ type: 'varchar' })
  roadAddress: string; // 도로명 주소 (카카오 API에서 받아옴)

  @Column({ type: 'varchar', nullable: true })
  postalCode: string | null; // 우편번호 (카카오 API에서 받아옴)

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number;

  @Column({ default: false })
  isDefault: boolean; // 기본 주소 여부 (마이페이지 표시용)

  @Column({ default: false })
  isSearchAddress: boolean; // 검색 주소 여부 (메뉴 추천/검색 시 사용)

  @Column({ type: 'varchar', nullable: true })
  alias: string | null; // 주소 별칭 (예: "집", "회사")

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null; // Soft delete
}
