import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ensureNotificationSchema } from './ensure-schema';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    await ensureNotificationSchema(this); // creates the notification tables if the database does not have them yet
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
