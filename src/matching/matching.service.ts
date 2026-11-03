import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { photoVerificationRequired } from '../verification/verification.config';
import { Dist } from '../common/distance';
import { haversineKm } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { bestDistance } from '../common/distance';
import { effectiveOrigin, toPublicView } from '../profile/public-view';
import { boundingBox, dobBounds, scoreCompat } from './compat';
import { DiscoverQueryDto, TravelDto } from './dto/matching.dto';
import { freshGps, GPS_FRESH_MS, NEARBY_MESSAGE_KM, sortedPair } from '../chat/chat.rules';

const WITH_CARD = {
  profile: true,
  privacy: true,
  media: { orderBy: { position: 'asc' as const } },
  icebreakers: { orderBy: { position: 'asc' as const } },
};

@Injectable()
export class MatchingService {
  constructor(private prisma: PrismaService) {}

  private async myProfile(userId: string) {
    const me = await this.prisma.profile.findUnique({ where: { userId } });
    if (!me?.onboardingComplete) throw new BadRequestException('Complete your profile first');
    return me;
  }

  private async blockedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r: any) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  // ---------------------------------------------------------------- discovery
  async discover(userId: string, q: DiscoverQueryDto) {
    const me = await this.myProfile(userId);
    const mode = q.mode ?? 'suggested';
    const close = mode === 'close';

    if (q.minAge != null && q.maxAge != null && q.minAge > q.maxAge) throw new BadRequestException('Minimum age cannot be above maximum age');

    // "close" uses live GPS (accurate to ~100 m); every other mode uses the chosen city / Travel Mode,
    // falling back to a fresh GPS fix for members who never picked a city.
    const myGps = freshGps(me);
    const origin = close ? myGps : effectiveOrigin(me) ?? myGps;
    if (close && !myGps) throw new BadRequestException(`Turn on location to see people within ${NEARBY_MESSAGE_KM} km`);
    if (mode === 'nearby' && !origin) throw new BadRequestException('Set your location to see people nearby');
    // A distance filter that silently does nothing would return people outside the range the member asked for.
    if (q.maxDistanceKm != null && !origin) throw new BadRequestException('Set your location to filter by distance');

    const [swiped, blocked] = await Promise.all([
      this.prisma.swipe.findMany({ where: { fromId: userId }, select: { toId: true } }),
      this.blockedIds(userId),
    ]);
    // In "close" mode people you passed on stay visible: you may still want to message someone nearby.
    const exclude = [userId, ...(close ? [] : swiped.map((s: any) => s.toId)), ...blocked];

    const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });
    const radius = close ? NEARBY_MESSAGE_KM : q.maxDistanceKm ?? (mode === 'nearby' ? 50 : undefined);
    const dob = dobBounds(q.minAge, q.maxAge);

    const profileWhere: any = {
      onboardingComplete: true,
      gender: me.gender === 'MALE' ? 'FEMALE' : 'MALE',
      ...(dob.gte || dob.lte ? { dateOfBirth: dob } : {}),
      ...(q.country ? { country: { equals: q.country, mode: 'insensitive' } } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.sect ? { sect: q.sect } : {}),
      ...(q.religiousness ? { religiousness: q.religiousness } : {}),
      ...(q.timeline ? { marriageTimeline: q.timeline } : {}),
      ...(q.education ? { education: ci(q.education) } : {}),
      ...(q.profession ? { profession: ci(q.profession) } : {}),
      ...(q.ethnicity ? { ethnicity: ci(q.ethnicity) } : {}),
      ...(q.language ? { languages: { has: q.language } } : {}),
      ...(q.interest ? { interests: { has: q.interest } } : {}),
      ...(q.verifiedOnly || photoVerificationRequired() ? { verified: true } : {}),
      ...(q.wantsChildren != null ? { wantsChildren: q.wantsChildren } : {}),
    };
    if (radius && origin) {
      const b = boundingBox(origin.lat, origin.lng, radius);
      const [latKey, lngKey] = close ? ['gpsLatitude', 'gpsLongitude'] : ['latitude', 'longitude'];
      profileWhere[latKey] = { gte: b.latMin, lte: b.latMax };
      profileWhere[lngKey] = { gte: b.lngMin, lte: b.lngMax };
    }
    if (close) profileWhere.gpsUpdatedAt = { gte: new Date(Date.now() - GPS_FRESH_MS) };

    const privacyOff: any[] = [{ hideProfile: true }, { invisibleMode: true }];
    if (close) privacyOff.push({ allowNearbyMessages: false });

    const users = await this.prisma.user.findMany({
      where: {
        id: { notIn: exclude },
        role: 'USER',
        status: 'ACTIVE',
        profile: profileWhere,
        NOT: { privacy: { OR: privacyOff } },
      },
      include: WITH_CARD,
      orderBy: { lastActiveAt: 'desc' },
      take: 300,
    });

    type Row = { u: any; dist: number | null; d: Dist; score: number; reasons: string[] };
    const scored: Row[] = (users as any[])
      .map((u: any): Row => {
        const p = u.profile;
        // "close" is measured from live GPS; every other mode uses the best distance available (GPS, Travel Mode or city).
        const d: Dist = close
          ? { km: origin && p.gpsLatitude != null && p.gpsLongitude != null ? haversineKm(origin.lat, origin.lng, p.gpsLatitude, p.gpsLongitude) : null, source: 'gps' }
          : bestDistance(me, p);
        return { u, dist: d.km, d, ...scoreCompat(me, p, d.km) };
      })
      .filter((r: Row) => !(radius && origin && r.dist != null && r.dist > radius));

    scored.sort((a: Row, b: Row) => {
      if (mode === 'nearby' || close) return (a.dist ?? 1e9) - (b.dist ?? 1e9);
      return b.score - a.score;
    });

    return scored.slice(0, q.limit ?? 20).map((r: Row) => ({
      ...toPublicView(r.u, origin, r.d),
      compatibility: r.score,
      reasons: r.reasons,
      ...(close ? { nearbyMessaging: true } : {}),
    }));
  }

  // ------------------------------------------------------------------- swipes
  async swipe(userId: string, targetId: string, action: 'LIKE' | 'PASS') {
    if (userId === targetId) throw new BadRequestException('You cannot swipe on yourself');
    const me = await this.myProfile(userId);

    const target = await this.prisma.user.findUnique({ where: { id: targetId }, include: WITH_CARD });
    if (!target || target.status !== 'ACTIVE' || !target.profile?.onboardingComplete) throw new NotFoundException('Profile not found');
    if ((await this.blockedIds(userId)).includes(targetId)) throw new NotFoundException('Profile not found');
    if (target.profile.gender === me.gender) throw new BadRequestException('This profile is not available');

    await this.prisma.swipe.upsert({
      where: { fromId_toId: { fromId: userId, toId: targetId } },
      create: { fromId: userId, toId: targetId, action },
      update: { action },
    });
    if (action === 'PASS') return { matched: false };

    const reverse = await this.prisma.swipe.findUnique({ where: { fromId_toId: { fromId: targetId, toId: userId } } });
    if (reverse?.action !== 'LIKE') return { matched: false };

    const [a, b] = [userId, targetId].sort();
    const match = await this.prisma.match.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b },
      update: {},
    });
    await this.prisma.conversation.updateMany({
      where: { userAId: a, userBId: b, status: { in: ['PENDING', 'DECLINED'] } },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    return { matched: true, matchId: match.id, profile: toPublicView(target, effectiveOrigin(me), bestDistance(me, target.profile)) };
  }

  async likesReceived(userId: string) {
    const me = await this.myProfile(userId);
    const [blocked, mine] = await Promise.all([
      this.blockedIds(userId),
      this.prisma.swipe.findMany({ where: { fromId: userId }, select: { toId: true } }),
    ]);
    const handled = [...blocked, ...mine.map((s: any) => s.toId)];
    const likes = await this.prisma.swipe.findMany({
      where: { toId: userId, action: 'LIKE', fromId: { notIn: handled } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { from: { include: WITH_CARD } },
    });
    const origin = effectiveOrigin(me);
    return likes
      .filter((l: any) => l.from.status === 'ACTIVE' && l.from.profile?.onboardingComplete && !l.from.privacy?.hideProfile)
      .map((l: any) => ({ ...toPublicView(l.from, origin, bestDistance(me, l.from.profile)), likedAt: l.createdAt }));
  }

  // ------------------------------------------------------------------ matches
  async matches(userId: string) {
    const me = await this.myProfile(userId);
    const blocked = await this.blockedIds(userId);
    const rows = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: { userA: { include: WITH_CARD }, userB: { include: WITH_CARD } },
    });
    const origin = effectiveOrigin(me);
    return rows
      .map((m: any) => ({ m, other: m.userAId === userId ? m.userB : m.userA }))
      .filter(({ other }: any) => other.status === 'ACTIVE' && other.profile?.onboardingComplete && !blocked.includes(other.id))
      .map(({ m, other }: any) => ({ matchId: m.id, matchedAt: m.createdAt, profile: toPublicView(other, origin, bestDistance(me, other.profile)) }));
  }

  async unmatch(userId: string, matchId: string) {
    const m = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!m || (m.userAId !== userId && m.userBId !== userId)) throw new NotFoundException('Match not found');
    await this.prisma.match.delete({ where: { id: matchId } });
    return { deleted: true };
  }

  // ------------------------------------------------------------------- blocks
  async block(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestException('You cannot block yourself');
    const t = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!t) throw new NotFoundException('User not found');
    const [a, b] = [userId, targetId].sort();
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
        create: { blockerId: userId, blockedId: targetId },
        update: {},
      }),
      this.prisma.match.deleteMany({ where: { userAId: a, userBId: b } }),
      this.prisma.conversation.updateMany({ where: { userAId: a, userBId: b }, data: { status: 'CLOSED' } }),
    ]);
    return { blocked: true };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { blocked: false };
  }

  async blocks(userId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { include: { profile: { select: { firstName: true } } } } },
    });
    return rows.map((r: any) => ({ userId: r.blockedId, firstName: r.blocked.profile?.firstName ?? 'Member', blockedAt: r.createdAt }));
  }

  // ------------------------------------------------------------- travel mode
  async setTravel(userId: string, dto: TravelDto) {
    await this.myProfile(userId);
    await this.prisma.profile.update({
      where: { userId },
      data: { travelActive: true, travelCity: dto.city, travelCountry: dto.country, travelLatitude: dto.latitude, travelLongitude: dto.longitude },
    });
    return { travelActive: true, travelCity: dto.city, travelCountry: dto.country };
  }

  async clearTravel(userId: string) {
    await this.prisma.profile.update({
      where: { userId },
      data: { travelActive: false, travelCity: null, travelCountry: null, travelLatitude: null, travelLongitude: null },
    });
    return { travelActive: false };
  }
}
