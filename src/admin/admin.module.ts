import { Module } from '@nestjs/common';
import { AdminBootstrap } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';

@Module({ controllers: [AdminController], providers: [AdminBootstrap] })
export class AdminModule {}
