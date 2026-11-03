import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicView } from '../profile/public-view';

const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 50;
const CARD = { profile: true, privacy: true, media: { orderBy: { position: 'asc' as const } } };

/**
 * What is new for a member since their last check: people who liked them, new matches and new messages.
 * Read-only and derived from existing tables (no schema change). The app polls this and shows local notifications.
 * Events are returned in time order with stable ids, so the app can safely de-duplicate.
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Name + the photo other members are allowed to see (blur / private photo rules applied). Never anything else. */
  private brief(user: any) {
    if (!user?.profile) return null;
    const v = toPublicView(user, null, null);
    const photo = v.media.find((m: any) => m.type === 'PHOTO');
    return { id: v.id, firstName: v.firstName, photo: photo ? photo.url : null };
  }

  async since(userId: string, sinceIso?: string) {
    const serverTime = new Date(); // taken BEFORE querying: an event can repeat on the next call, never be missed
    if (!sinceIso) return { serverTime, likes: [], matches: [], messages: [] };
    const floor = new Date(serverTime.getTime() - MAX_LOOKBACK_MS);
    const since = new Date(Math.max(new Date(sinceIso).getTime(), floor.getTime()));

    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const blocked = (blocks as any[]).map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
    const active = { status: 'ACTIVE' as const, profile: { is: { onboardingComplete: true } } };

    const [likeRows, matchRows, msgRows, myLikes] = await Promise.all([
      this.prisma.swipe.findMany({
        where: { toId: userId, action: 'LIKE', createdAt: { gt: since }, fromId: { notIn: blocked }, from: active },
        orderBy: { createdAt: 'asc' }, take: MAX_EVENTS,
        include: { from: { include: CARD } },
      }),
      this.prisma.match.findMany({
        where: { createdAt: { gt: since }, OR: [{ userAId: userId }, { userBId: userId }] },
        orderBy: { createdAt: 'asc' }, take: MAX_EVENTS,
        include: { userA: { include: CARD }, userB: { include: CARD } },
      }),
      this.prisma.message.findMany({
        where: {
          senderId: { not: userId, notIn: blocked }, createdAt: { gt: since },
          conversation: { status: { in: ['PENDING', 'ACCEPTED'] }, OR: [{ userAId: userId }, { userBId: userId }] },
        },
        orderBy: { createdAt: 'asc' }, take: MAX_EVENTS,
        include: { sender: { include: CARD }, conversation: { select: { id: true, status: true, origin: true, initiatorId: true } } },
      }),
      this.prisma.swipe.findMany({ where: { fromId: userId, action: 'LIKE' }, select: { toId: true } }),
    ]);

    const iLiked = new Set((myLikes as any[]).map((s) => s.toId));
    return {
      serverTime,
      // A like from someone you already liked is a match, reported under `matches` instead.
      likes: (likeRows as any[])
        .filter((s) => !iLiked.has(s.fromId))
        .map((s) => ({ id: s.id, createdAt: s.createdAt, from: this.brief(s.from) }))
        .filter((e) => e.from),
      matches: (matchRows as any[])
        .map((m) => ({ id: m.id, createdAt: m.createdAt, with: this.brief(m.userAId === userId ? m.userB : m.userA) }))
        .filter((e) => e.with),
      messages: (msgRows as any[])
        .map((m) => ({
          id: m.id,
          createdAt: m.createdAt,
          conversationId: m.conversationId,
          isRequest: m.conversation.status === 'PENDING',
          body: m.body.length > 140 ? `${m.body.slice(0, 137)}...` : m.body,
          from: this.brief(m.sender),
        }))
        .filter((e) => e.from),
    };
  }
}
