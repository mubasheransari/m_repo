import { Module } from '@nestjs/common';
import { GeoBackfillService } from './geo-backfill.service';
import { GeoController } from './geo.controller';

@Module({ controllers: [GeoController], providers: [GeoBackfillService] })
export class GeoModule {}
