import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicView } from '../profile/public-view';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_MS = DAY_MS;
const MAX_EVENTS = 50;
const CARD = { profile: true, privacy: true, media: { orderBy: { position: 'asc' as const } } };

export type NotifType = 'PROFILE_VISIT' | 'LIKE' | 'MATCH' | 'MESSAGE' | 'MESSAGE_REQUEST' | 'DIRECT_MESSAGE' | 'REQUEST_ACCEPTED' | 'QUIZ';

/** Rows that belong to one chat. Opening the chat marks them read. */
const CHAT_GROUP_PREFIXES = ['MSG', 'REQ', 'ACC', 'QUIZ'];

/** Where the app should go when the member taps a notification. */
export type NotifTarget = { screen: 'chat' | 'profile' | 'match'; conversationId?: string; userId?: string };

type PutInput = {
  userId: string;
  actorId?: string | null;
  type: NotifType;
  /** Wording, built from the final count (a grouped row says "3 new messages", not "new message"). */
  text: (count: number) => { title: string; body: string };
  data?: Record<string, unknown>;
  /** The unread row with the same key is updated instead of adding a new one. */
  groupKey?: string;
  /** 'bump' (default): update the unread row and move it forward, so the app notifies again. 'ignore': leave it as it is. */
  onExisting?: 'bump' | 'ignore';
  /** Use this as the count instead of "previous + 1" (visits know their exact total). */
  count?: number;
};

const preview = (s: string, max = 140) => (s.length > max ? `${s.slice(0, max - 3)}...` : s);

/**
 * The member's notification inbox, plus the events that fill it (likes, matches, messages, direct messages, profile visits).
 *
 * - Every event helper is "best effort": a failure is logged and swallowed, so a notification problem can never break
 *   liking, messaging or viewing a profile.
 * - Unread rows of the same kind are merged (see `groupKey`), so 20 messages in one chat are ONE notification.
 * - Rows become read only when the member opens them (POST /notifications/:id/read), or opens the chat they are about.
 */
@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(private prisma: PrismaService) {}

  // =================================================================== writing
  private async nameOf(userId: string): Promise<string> {
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { firstName: true } });
    return p?.firstName ?? 'Someone';
  }

  private async put(n: PutInput) {
    const now = new Date();
    if (n.groupKey) {
      const existing = await this.prisma.notification.findFirst({
        where: { userId: n.userId, groupKey: n.groupKey, readAt: null },
        orderBy: { lastEventAt: 'desc' },
      });
      if (existing) {
        if (n.onExisting === 'ignore') return existing;
        const prev = ((existing.data as any) ?? {}) as Record<string, unknown>;
        const count = n.count ?? Number(prev.count ?? 1) + 1;
        const { title, body } = n.text(count);
        return this.prisma.notification.update({
          where: { id: existing.id },
          data: { title, body, lastEventAt: now, data: { ...prev, ...(n.data ?? {}), count } as any },
        });
      }
    }
    const count = n.count ?? 1;
    const { title, body } = n.text(count);
    return this.prisma.notification.create({
      data: {
        userId: n.userId,
        actorId: n.actorId ?? null,
        type: n.type as any,
        title,
        body,
        groupKey: n.groupKey ?? null,
        data: { ...(n.data ?? {}), count } as any,
        createdAt: now,
        lastEventAt: now,
      },
    });
  }

  private async safe(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e: any) {
      this.log.warn(`${label} failed: ${e?.message ?? e}`);
    }
  }

  // ----- events -----
  /** Someone liked `toId` (and it is not a match). */
  likeReceived(toId: string, fromId: string) {
    return this.safe('like', async () => {
      if (toId === fromId) return;
      const name = await this.nameOf(fromId);
      await this.put({
        userId: toId, actorId: fromId, type: 'LIKE', groupKey: `LIKE:${fromId}`, onExisting: 'ignore',
        data: { profileId: fromId },
        text: () => ({ title: `${name} likes you`, body: 'Open their profile and like them back.' }),
      });
    });
  }

  /** A new match: both members are told. */
  matched(aId: string, bId: string) {
    return this.safe('match', async () => {
      const [an, bn] = await Promise.all([this.nameOf(aId), this.nameOf(bId)]);
      await Promise.all([
        this.put({
          userId: aId, actorId: bId, type: 'MATCH', groupKey: `MATCH:${bId}`, onExisting: 'ignore', data: { profileId: bId },
          text: () => ({ title: `It's a match with ${bn}!`, body: 'You liked each other. Say salaam.' }),
        }),
        this.put({
          userId: bId, actorId: aId, type: 'MATCH', groupKey: `MATCH:${aId}`, onExisting: 'ignore', data: { profileId: aId },
          text: () => ({ title: `It's a match with ${an}!`, body: 'You liked each other. Say salaam.' }),
        }),
      ]);
    });
  }

  /** `viewerId` opened `profileId`'s profile. `totalByViewer` = how many times this viewer has visited, in all. */
  profileVisited(profileId: string, viewerId: string, totalByViewer: number) {
    return this.safe('visit', async () => {
      if (profileId === viewerId) return;
      const name = await this.nameOf(viewerId);
      await this.put({
        userId: profileId, actorId: viewerId, type: 'PROFILE_VISIT', groupKey: `VISIT:${viewerId}`, count: totalByViewer,
        data: { profileId: viewerId },
        text: (c) => ({
          title: `${name} viewed your profile`,
          body: c > 1 ? `${name} has visited your profile ${c} times.` : 'Tap to see who they are.',
        }),
      });
    });
  }

  /**
   * A message for `toId`. kind: MESSAGE (normal chat), REQUEST (a nearby member asks to chat),
   * DIRECT (a member used "message me directly"). Requests carry the first message as the preview.
   */
  messageReceived(p: { toId: string; fromId: string; conversationId: string; body: string; kind: 'MESSAGE' | 'REQUEST' | 'DIRECT' }) {
    return this.safe('message', async () => {
      if (p.toId === p.fromId) return;
      const name = await this.nameOf(p.fromId);
      const body = preview(p.body);
      const data = { conversationId: p.conversationId, profileId: p.fromId };
      if (p.kind === 'MESSAGE') {
        await this.put({
          userId: p.toId, actorId: p.fromId, type: 'MESSAGE', groupKey: `MSG:${p.conversationId}`, data,
          text: (c) => ({ title: c > 1 ? `${c} new messages from ${name}` : `New message from ${name}`, body }),
        });
      } else if (p.kind === 'DIRECT') {
        await this.put({
          userId: p.toId, actorId: p.fromId, type: 'DIRECT_MESSAGE', groupKey: `REQ:${p.conversationId}`, data,
          text: () => ({ title: `${name} messaged you directly`, body }),
        });
      } else {
        await this.put({
          userId: p.toId, actorId: p.fromId, type: 'MESSAGE_REQUEST', groupKey: `REQ:${p.conversationId}`, data,
          text: () => ({ title: `${name} sent you a message request`, body }),
        });
      }
    });
  }

  /** The member who started a conversation is told it was accepted. */
  requestAccepted(initiatorId: string, responderId: string, conversationId: string) {
    return this.safe('accepted', async () => {
      const name = await this.nameOf(responderId);
      await this.put({
        userId: initiatorId, actorId: responderId, type: 'REQUEST_ACCEPTED', groupKey: `ACC:${conversationId}`, onExisting: 'ignore',
        data: { conversationId, profileId: responderId },
        text: () => ({ title: `${name} accepted your message request`, body: 'You can chat now.' }),
      });
    });
  }

  quizSent(toId: string, fromId: string, conversationId: string, quizTitle: string) {
    return this.safe('quiz-sent', async () => {
      const name = await this.nameOf(fromId);
      await this.put({
        userId: toId, actorId: fromId, type: 'QUIZ', groupKey: `QUIZ:${conversationId}`, data: { conversationId, profileId: fromId },
        text: () => ({ title: `${name} sent you a quiz`, body: `${quizTitle}: answer it to see how compatible you are.` }),
      });
    });
  }

  quizDone(toId: string, fromId: string, conversationId: string, quizTitle: string, score: number) {
    return this.safe('quiz-done', async () => {
      const name = await this.nameOf(fromId);
      await this.put({
        userId: toId, actorId: fromId, type: 'QUIZ', groupKey: `QUIZ:${conversationId}`, data: { conversationId, profileId: fromId },
        text: () => ({ title: `${name} finished the quiz`, body: `${quizTitle}: you are ${score}% compatible.` }),
      });
    });
  }

  /** The member opened (or answered in) a chat: its message notifications are read. */
  clearConversation(userId: string, conversationId: string) {
    return this.safe('clear-conversation', async () => {
      await this.prisma.notification.updateMany({
        where: { userId, readAt: null, groupKey: { in: CHAT_GROUP_PREFIXES.map((p) => `${p}:${conversationId}`) } },
        data: { readAt: new Date() },
      });
    });
  }

  /** Blocking removes every notification between the two (and the visits behind them). */
  forgetPair(a: string, b: string) {
    return this.safe('forget-pair', async () => {
      await this.prisma.notification.deleteMany({ where: { OR: [{ userId: a, actorId: b }, { userId: b, actorId: a }] } });
      await this.prisma.profileVisit.deleteMany({ where: { OR: [{ viewerId: a, profileId: b }, { viewerId: b, profileId: a }] } });
    });
  }

  // =================================================================== reading
  private async blockedWith(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  /** Notifications about someone who is blocked (either way) are never shown. */
  private visible(userId: string, blocked: string[]) {
    return blocked.length ? { userId, OR: [{ actorId: null }, { actorId: { notIn: blocked } }] } : { userId };
  }

  private target(n: { type: string; actorId: string | null; data: any }): NotifTarget {
    const d = (n.data ?? {}) as { conversationId?: string; profileId?: string };
    switch (n.type) {
      case 'MESSAGE':
      case 'MESSAGE_REQUEST':
      case 'DIRECT_MESSAGE':
      case 'REQUEST_ACCEPTED':
      case 'QUIZ':
        return { screen: 'chat', conversationId: d.conversationId, userId: n.actorId ?? d.profileId };
      case 'MATCH':
        return { screen: 'match', userId: n.actorId ?? d.profileId };
      default: // LIKE, PROFILE_VISIT
        return { screen: 'profile', userId: n.actorId ?? d.profileId };
    }
  }

  /** Name + the photo other members may see (blur / private photo rules applied). Never anything else. */
  private brief(user: any) {
    if (!user?.profile) return null;
    const v = toPublicView(user, null, null);
    const photo = v.media.find((m: any) => m.type === 'PHOTO');
    return { id: v.id, firstName: v.firstName, photo: photo ? photo.url : null, verified: v.verified };
  }

  private async items(rows: any[]) {
    const ids = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, include: CARD }) : [];
    const byId = new Map<string, any>(actors.map((u: any) => [u.id, u]));
    return rows
      .map((r) => {
        const actorUser = r.actorId ? byId.get(r.actorId) : null;
        // The person behind it is gone, banned or suspended: do not show it.
        if (r.actorId && (!actorUser || actorUser.status !== 'ACTIVE' || !actorUser.profile)) return null;
        const data = (r.data ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          body: r.body,
          read: !!r.readAt,
          readAt: r.readAt,
          createdAt: r.createdAt,
          lastEventAt: r.lastEventAt,
          count: Number(data.count ?? 1),
          actor: actorUser ? this.brief(actorUser) : null,
          target: this.target(r),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  async unreadCount(userId: string, blocked?: string[]) {
    const b = blocked ?? (await this.blockedWith(userId));
    const rows = await this.prisma.notification.groupBy({
      by: ['type'],
      where: { ...this.visible(userId, b), readAt: null },
      _count: { _all: true },
    });
    const byType: Record<string, number> = {};
    let unread = 0;
    for (const r of rows) { byType[r.type] = r._count._all; unread += r._count._all; }
    return { unread, byType };
  }

  /** The list screen: newest activity first, 30 per page. `cursor` = `nextCursor` of the previous page. */
  async inbox(userId: string, opts: { limit?: number; cursor?: string; unreadOnly?: boolean }) {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const blocked = await this.blockedWith(userId);
    const where: any = { ...this.visible(userId, blocked) };
    if (opts.unreadOnly) where.readAt = null;
    if (opts.cursor) where.lastEventAt = { lt: new Date(opts.cursor) };

    const [rows, counts] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ lastEventAt: 'desc' }, { id: 'desc' }], take: limit + 1 }),
      this.unreadCount(userId, blocked),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    if (!opts.cursor && Math.random() < 0.05) void this.prune(userId); // housekeeping, now and then
    return {
      items: await this.items(page),
      nextCursor: hasMore ? page[page.length - 1].lastEventAt.toISOString() : null,
      unread: counts.unread,
      unreadByType: counts.byType,
    };
  }

  /**
   * What is new since the app last asked (the app turns these into local notifications). Pass the `serverTime` of the previous
   * answer as `since`. Only UNREAD rows are returned, and a grouped row comes back again when it gets a newer event.
   * Without `since` it only returns the counts (the app has nothing to announce on its first call).
   */
  async updates(userId: string, sinceIso?: string) {
    const serverTime = new Date(); // taken BEFORE querying: an event may repeat on the next call, never be missed
    const blocked = await this.blockedWith(userId);
    const counts = await this.unreadCount(userId, blocked);
    if (!sinceIso) return { serverTime, items: [], unread: counts.unread, unreadByType: counts.byType };

    const floor = serverTime.getTime() - MAX_LOOKBACK_MS;
    const since = new Date(Math.max(new Date(sinceIso).getTime(), floor));
    const rows = await this.prisma.notification.findMany({
      where: { ...this.visible(userId, blocked), readAt: null, lastEventAt: { gt: since } },
      orderBy: { lastEventAt: 'asc' },
      take: MAX_EVENTS,
    });
    return { serverTime, items: await this.items(rows), unread: counts.unread, unreadByType: counts.byType };
  }

  // ------------------------------------------------------------------ read state
  async markRead(userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true, readAt: true } });
    if (!row) throw new NotFoundException('Notification not found');
    if (!row.readAt) await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return { id, read: true, ...(await this.unreadCount(userId)) };
  }

  async markMany(userId: string, ids: string[]) {
    await this.prisma.notification.updateMany({ where: { userId, id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
    return this.unreadCount(userId);
  }

  async markAll(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { unread: 0, byType: {} as Record<string, number> };
  }

  async remove(userId: string, id: string) {
    const r = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Notification not found');
    return { deleted: true, ...(await this.unreadCount(userId)) };
  }

  private async prune(userId: string) {
    await this.safe('prune', async () => {
      await this.prisma.notification.deleteMany({
        where: { userId, OR: [{ readAt: { not: null }, lastEventAt: { lt: new Date(Date.now() - 30 * DAY_MS) } }, { lastEventAt: { lt: new Date(Date.now() - 90 * DAY_MS) } }] },
      });
    });
  }

  // ============================================================ legacy feed
  /**
   * OLD polling feed (`GET /notifications`): derived from likes / matches / messages, no read state. Kept so app builds that
   * already use it keep working. New app code uses `inbox` and `updates` instead.
   */
  async since(userId: string, sinceIso?: string) {
    const serverTime = new Date();
    if (!sinceIso) return { serverTime, likes: [], matches: [], messages: [] };
    const floor = new Date(serverTime.getTime() - MAX_LOOKBACK_MS);
    const since = new Date(Math.max(new Date(sinceIso).getTime(), floor.getTime()));

    const blocked = await this.blockedWith(userId);
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
          body: preview(m.body),
          from: this.brief(m.sender),
        }))
        .filter((e) => e.from),
    };
  }
}
