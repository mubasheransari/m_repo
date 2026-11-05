import { Injectable, Logger } from '@nestjs/common';
import { bestDistance } from '../common/distance';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveOrigin, toPublicView } from './public-view';

/** The same person opening your profile again within this time is one visit (refreshing the screen must not inflate the count). */
export const VISIT_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CARD = { profile: true, privacy: true, media: { orderBy: { position: 'asc' as const } }, icebreakers: { orderBy: { position: 'asc' as const } } };

/**
 * "Who viewed my profile". A visit is recorded when a member opens someone else's profile (GET /profiles/:id).
 * Members in Invisible mode, or with a hidden profile, leave no trace, and nobody is told they were visited by them.
 */
@Injectable()
export class ProfileVisitsService {
  private log = new Logger('ProfileVisits');
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Records the visit (and tells the profile owner). Never throws: a problem here must not stop the profile from loading. */
  async record(viewerId: string, profileId: string): Promise<void> {
    if (viewerId === profileId) return;
    try {
      const viewer = await this.prisma.privacySettings.findUnique({ where: { userId: viewerId }, select: { invisibleMode: true, hideProfile: true } });
      if (viewer?.invisibleMode || viewer?.hideProfile) return;

      const recent = await this.prisma.profileVisit.findFirst({
        where: { viewerId, profileId, createdAt: { gt: new Date(Date.now() - VISIT_WINDOW_MS) } },
        select: { id: true },
      });
      if (recent) return;

      await this.prisma.profileVisit.create({ data: { viewerId, profileId } });
      const total = await this.prisma.profileVisit.count({ where: { viewerId, profileId } });
      await this.notifications.profileVisited(profileId, viewerId, total);
    } catch (e: any) {
      this.log.warn(`record failed: ${e?.message ?? e}`);
    }
  }

  /** Small numbers for the member's own profile screen (also returned by GET /me as `profileViews`). */
  async summary(userId: string): Promise<{ total: number; last7Days: number }> {
    try {
      const [total, last7Days] = await Promise.all([
        this.prisma.profileVisit.count({ where: { profileId: userId } }),
        this.prisma.profileVisit.count({ where: { profileId: userId, createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) } } }),
      ]);
      return { total, last7Days };
    } catch (e: any) {
      this.log.warn(`summary failed: ${e?.message ?? e}`);
      return { total: 0, last7Days: 0 };
    }
  }

  /** The visitors screen: totals plus each visitor with how many times they came and when last. */
  async list(userId: string, limit = 50) {
    const [groups, last7Days, mine, blockRows] = await Promise.all([
      this.prisma.profileVisit.groupBy({
        by: ['viewerId'],
        where: { profileId: userId },
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
      }),
      this.prisma.profileVisit.count({ where: { profileId: userId, createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) } } }),
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } }),
    ]);

    const blocked = new Set(blockRows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
    const wanted = groups.filter((g) => !blocked.has(g.viewerId)).slice(0, Math.min(Math.max(limit, 1), 100));
    const users = wanted.length
      ? await this.prisma.user.findMany({ where: { id: { in: wanted.map((g) => g.viewerId) } }, include: CARD })
      : [];
    const byId = new Map<string, any>(users.map((u: any) => [u.id, u]));
    const origin = effectiveOrigin(mine);

    const visitors = wanted
      .map((g) => ({ g, u: byId.get(g.viewerId) }))
      .filter(({ u }) => u && u.status === 'ACTIVE' && u.profile?.onboardingComplete && !u.privacy?.hideProfile && !u.privacy?.invisibleMode)
      .map(({ g, u }) => ({
        visitCount: g._count._all,
        lastVisitAt: g._max.createdAt,
        profile: toPublicView(u, origin, bestDistance(mine, u.profile)),
      }));

    return {
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      unique: groups.length,
      last7Days,
      visitors,
    };
  }
}
