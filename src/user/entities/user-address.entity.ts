import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SocialLogin } from './social-login.entity';
import { User } from './user.entity';

@Entity('user_address')
export class UserAddress {
  @PrimaryGeneratedColumn()
  id: number;

  // User 또는 SocialLogin 중 하나만 참조
  @ManyToOne(() => User, (user) => user.addresses, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  user: User | null;

  @ManyToOne(() => SocialLogin, (socialLogin) => socialLogin.addresses, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  socialLogin: SocialLogin | null;

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

