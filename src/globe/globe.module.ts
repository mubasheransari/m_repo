import { Module } from '@nestjs/common';
import { GlobeController } from './globe.controller';
import { GlobeService } from './globe.service';

@Module({ controllers: [GlobeController], providers: [GlobeService] })
export class GlobeModule {}
