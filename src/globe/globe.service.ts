import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { coarse, freshGps, GPS_FRESH_MS } from '../chat/chat.rules';
import { ageFromDob, haversineKm } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { mediaPath } from '../profile/public-view';
import { photoVerificationRequired } from '../verification/verification.config';

/** Others only ever see a position rounded to 0.01 degrees (about 1 km), never the stored ~100 m one. */
const onGlobe = (n: number) => Math.round(n * 100) / 100;
const MAX_PEOPLE = 500;

@Injectable()
export class GlobeService {
  constructor(private prisma: PrismaService) {}

  /** Turn "Show my location" on or off. Turning it on needs a position. */
  async setSharing(userId: string, enabled: boolean, latitude?: number, longitude?: number) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new BadRequestException('Complete your profile first');

    if (enabled) {
      if (latitude == null || longitude == null) throw new BadRequestException('Your location is needed to show you on the globe');
      const data: any = { gpsLatitude: coarse(latitude), gpsLongitude: coarse(longitude), gpsUpdatedAt: new Date() };
      if (profile.latitude == null || profile.longitude == null) { data.latitude = coarse(latitude); data.longitude = coarse(longitude); }
      await this.prisma.$transaction([
        this.prisma.profile.update({ where: { userId }, data }),
        this.prisma.privacySettings.upsert({ where: { userId }, create: { userId, showOnGlobe: true }, update: { showOnGlobe: true } }),
      ]);
      return { showOnGlobe: true };
    }

    const privacy = await this.prisma.privacySettings.upsert({ where: { userId }, create: { userId, showOnGlobe: false }, update: { showOnGlobe: false } });
    // The position was only being kept for the globe if nearby messaging is off too: do not keep it around.
    if (privacy.allowNearbyMessages === false) {
      await this.prisma.profile.update({ where: { userId }, data: { gpsLatitude: null, gpsLongitude: null, gpsUpdatedAt: null } });
    }
    return { showOnGlobe: false };
  }

  private async blockedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r: any) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  /** Members who share their location, shown only to members who share theirs. */
  async people(userId: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, privacy: true } });
    if (!me?.profile) throw new BadRequestException('Complete your profile first');
    if (!me.privacy?.showOnGlobe) {
      throw new ForbiddenException({ statusCode: 403, code: 'GLOBE_OFF', message: 'Turn on "Show my location" to see people on the globe' });
    }

    const blocked = await this.blockedIds(userId);
    const since = new Date(Date.now() - GPS_FRESH_MS);
    const rows = await this.prisma.user.findMany({
      where: {
        id: { notIn: [userId, ...blocked] },
        role: 'USER',
        status: 'ACTIVE',
        profile: {
          onboardingComplete: true,
          gender: me.profile.gender === 'MALE' ? 'FEMALE' : 'MALE',
          gpsLatitude: { not: null },
          gpsLongitude: { not: null },
          gpsUpdatedAt: { gte: since },
          ...(photoVerificationRequired() ? { verified: true } : {}),
        },
        privacy: { showOnGlobe: true, hideProfile: false, invisibleMode: false },
      },
      include: {
        profile: true,
        privacy: true,
        media: { where: { type: 'PHOTO', isPrivate: false }, orderBy: { position: 'asc' }, take: 1 },
      },
      orderBy: { lastActiveAt: 'desc' },
      take: MAX_PEOPLE,
    });

    const mine = freshGps(me.profile);
    const people = (rows as any[]).map((u) => {
      const p = u.profile;
      const m = u.media[0];
      const photo = m ? (u.privacy?.blurPhotos ? m.blurredUrl : m.url) : null;
      const km = mine ? haversineKm(mine.lat, mine.lng, p.gpsLatitude, p.gpsLongitude) : null;
      return {
        userId: u.id,
        firstName: p.firstName,
        age: ageFromDob(p.dateOfBirth),
        city: p.city,
        country: p.country,
        verified: p.verified,
        lat: onGlobe(p.gpsLatitude),
        lng: onGlobe(p.gpsLongitude),
        distanceKm: km != null && u.privacy?.showDistance !== false ? Math.max(1, Math.round(km)) : null,
        photo: photo ? { url: mediaPath(photo) } : null,
        updatedAt: p.gpsUpdatedAt,
      };
    });

    return {
      me: mine ? { lat: onGlobe(mine.lat), lng: onGlobe(mine.lng) } : null,
      total: people.length,
      people,
    };
  }
}
