import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ensureCallSchema } from './ensure-call-schema';
import { ensureNotificationSchema } from './ensure-schema';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    await ensureNotificationSchema(this); // creates the notification tables if the database does not have them yet
    await ensureCallSchema(this); // same for the voice / video call table
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
