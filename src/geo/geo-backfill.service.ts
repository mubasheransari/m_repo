import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findCity } from './cities';

/**
 * Members who signed up by typing their city have no coordinates, so Nearby and the distance filter could never
 * find them (and they could never use those features). On start-up we fill the gap from the city catalogue.
 * Only rows with NO coordinates are touched; nothing a member (or their GPS) set is ever overwritten.
 */
@Injectable()
export class GeoBackfillService implements OnApplicationBootstrap {
  private readonly log = new Logger('Geo');
  constructor(private prisma: PrismaService) {}

  async run(): Promise<number> {
    const rows = await this.prisma.profile.findMany({
      where: { OR: [{ latitude: null }, { longitude: null }], city: { not: null } },
      select: { userId: true, city: true, country: true },
    });
    let n = 0;
    for (const r of rows as { userId: string; city: string | null; country: string | null }[]) {
      const hit = findCity(r.city, r.country);
      if (!hit) continue;
      await this.prisma.profile.update({ where: { userId: r.userId }, data: { latitude: hit.lat, longitude: hit.lng } });
      n++;
    }
    return n;
  }

  onApplicationBootstrap() {
    this.run()
      .then((n) => n && this.log.log(`Added map coordinates to ${n} profile${n === 1 ? '' : 's'} from their city`))
      .catch((e) => this.log.warn(`Coordinate backfill skipped: ${e.message}`));
  }
}
