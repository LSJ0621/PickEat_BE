import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user.service';

@Injectable()
export class AdminInitializerService implements OnModuleInit {
  private readonly logger = new Logger(AdminInitializerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAdminUser();
  }

  private async ensureAdminUser(): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');
    const adminName = this.configService.get<string>('ADMIN_NAME') ?? '관리자';
    const adminRole = this.configService.get<string>('ADMIN_ROLE') ?? 'ADMIN';

    if (!adminEmail || !adminPassword) {
      this.logger.warn(
        'ADMIN_EMAIL or ADMIN_PASSWORD is not set. Skipping admin seeding.',
      );
      return;
    }

    const existing = await this.userService.findByEmail(adminEmail);
    if (existing) {
      this.logger.log(`Admin user already exists: ${adminEmail}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await this.userService.createUser({
      email: adminEmail,
      password: hashedPassword,
      role: adminRole,
      name: adminName,
    });

    this.logger.log(`Admin user created: ${adminEmail}`);
  }
}
