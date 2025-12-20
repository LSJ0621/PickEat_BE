import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { MenuRecommendation } from '../../menu/entities/menu-recommendation.entity';
import { MenuSelection } from '../../menu/entities/menu-selection.entity';
import { UserPreferences } from '../interfaces/user-preferences.interface';
import { UserAddress } from './user-address.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  password: string | null;

  @Column({ type: 'varchar', nullable: true })
  socialId: string | null;

  @Column({ type: 'varchar', nullable: true })
  socialType: string | null;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ default: 'USER' })
  role: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: false })
  reRegisterEmailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastPasswordChangedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => MenuRecommendation, (recommendation) => recommendation.user)
  recommendations: MenuRecommendation[];

  @OneToMany(() => MenuSelection, (selection) => selection.user)
  menuSelections: MenuSelection[];

  @OneToMany(() => UserAddress, (address) => address.user, {
    cascade: true,
  })
  addresses: UserAddress[];
}
