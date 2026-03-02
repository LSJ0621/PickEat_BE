import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Point } from 'geojson';
import { User } from '@/user/entities/user.entity';
import { UserPlaceStatus } from '../enum/user-place-status.enum';
import {
  MenuItem,
  BusinessHours,
} from '../interfaces/business-hours.interface';

@Entity('user_place')
@Index('idx_user_place_user_status', ['user', 'status'])
@Index('idx_user_place_created_at', ['createdAt'])
export class UserPlace {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number;

  @Index('idx_user_place_location', { synchronize: false })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: Point | null;

  @Column({ type: 'jsonb', default: '[]' })
  menuItems: MenuItem[];

  @Column({ type: 'simple-array', nullable: true })
  photos: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  businessHours: BusinessHours | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: UserPlaceStatus,
    default: UserPlaceStatus.PENDING,
  })
  status: UserPlaceStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'int', default: 0 })
  rejectionCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastRejectedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSubmittedAt: Date | null;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  ratingCount: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
