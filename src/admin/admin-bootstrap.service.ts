import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword, verifyPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Creates (or repairs) the first admin account from .env, so the admin panel can be used right after install:
 *   ADMIN_EMAIL=admin@example.com   ADMIN_PASSWORD=a-strong-password
 * Changing ADMIN_PASSWORD in .env and restarting changes the admin's password.
 */
@Injectable()
export class AdminBootstrap implements OnModuleInit {
  private readonly log = new Logger('Admin');
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async onModuleInit() {
    const email = (this.config.get<string>('ADMIN_EMAIL') || '').trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD') || '';
    if (!email && !password) return;
    if (!email || password.length < 8) {
      this.log.warn('ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) must both be set to create the admin account');
      return;
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await this.prisma.user.create({
        data: { email, name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword(password), privacy: { create: {} } },
      });
      this.log.log(`Admin account created: ${email}`);
      return;
    }
    const data: Record<string, unknown> = {};
    if (existing.role !== 'ADMIN') data.role = 'ADMIN';
    if (existing.status !== 'ACTIVE') data.status = 'ACTIVE';
    if (!(await verifyPassword(password, existing.passwordHash))) data.passwordHash = await hashPassword(password);
    if (Object.keys(data).length) {
      await this.prisma.user.update({ where: { id: existing.id }, data });
      this.log.log(`Admin account updated: ${email}`);
    } else {
      this.log.log(`Admin account ready: ${email}`);
    }
  }
}
