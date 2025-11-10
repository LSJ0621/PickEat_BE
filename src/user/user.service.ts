import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { SocialType } from './enum/social-type.enum';
import {
  defaultUserPreferences,
  UserPreferences,
} from './interfaces/user-preferences.interface';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async getOrFailByEmail(email: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async getUserBySocialId(socialId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { socialId: socialId.toString() },
    });
  }

  async createOauth(
    socialId: number,
    email: string,
    socialType: SocialType,
    profileImage?: string,
  ): Promise<User> {
    const user = this.userRepository.create({
      email,
      socialId: socialId.toString(),
      socialType,
      role: 'USER',
      profileImage,
    });
    return this.userRepository.save(user);
  }

  findAll() {
    return this.userRepository.find();
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    await this.userRepository.update(id, updateUserDto);
    return this.findOne(id);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    return user;
  }

  async getPreferences(userId: number): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    return user.preferences ?? defaultUserPreferences();
  }

  async updatePreferences(
    userId: number,
    tags: string[],
  ): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    const normalizedTags = this.normalizeTags(tags);
    user.preferences = { tags: normalizedTags };
    await this.userRepository.save(user);
    return user.preferences;
  }

  private normalizeTags(tags: string[] = []): string[] {
    const sanitized = tags
      .map((tag) => tag?.trim())
      .filter((tag): tag is string => Boolean(tag && tag.length));
    return Array.from(new Set(sanitized));
  }
}
