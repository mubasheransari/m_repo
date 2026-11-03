import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicView } from '../profile/public-view';
import { photoVerificationRequired } from '../verification/verification.config';
import { isValidThemeKey, normalizeThemeKey } from '../common/theme';
import { quizSummary } from '../quiz/quiz.view';
import { coarse, DAILY_NEARBY_REQUESTS, gpsDistanceKm, isNearby, NEARBY_MESSAGE_KM, REASON_TEXT, sortedPair } from './chat.rules';

const WITH_CARD = {
  profile: true,
  privacy: true,
  media: { orderBy: { position: 'asc' as const } },
  icebreakers: { orderBy: { position: 'asc' as const } },
};

export type Eligibility = {
  allowed: boolean;
  reason: 'MATCH' | 'NEARBY' | 'DIRECT' | 'EXISTING' | 'SELF' | 'UNAVAILABLE' | 'NOT_ALLOWED' | 'PENDING' | 'DECLINED' | 'NEARBY_OFF';
  distanceKm?: number;
  conversationId?: string;
};

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService, private matching: MatchingService) {}

  // ------------------------------------------------------------ my location
  async setLocation(userId: string, latitude: number, longitude: number) {
    const me = await this.prisma.profile.findUnique({ where: { userId } });
    if (!me) throw new BadRequestException('Complete your profile first');
    const gpsUpdatedAt = new Date();
    const data: any = { gpsLatitude: coarse(latitude), gpsLongitude: coarse(longitude), gpsUpdatedAt };
    // Members who never picked a city still get a usable position, so distances work for them too.
    if (me.latitude == null || me.longitude == null) { data.latitude = coarse(latitude); data.longitude = coarse(longitude); }
    await this.prisma.profile.update({ where: { userId }, data });
    return { updatedAt: gpsUpdatedAt };
  }

  async clearLocation(userId: string) {
    await this.prisma.profile.updateMany({ where: { userId }, data: { gpsLatitude: null, gpsLongitude: null, gpsUpdatedAt: null } });
    return { cleared: true };
  }

  // ------------------------------------------------------------ eligibility
  /** Single source of truth: may `userId` message `targetId` right now? */
  async eligibility(userId: string, targetId: string): Promise<Eligibility> {
    if (userId === targetId) return { allowed: false, reason: 'SELF' };

    const [me, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, privacy: true } }),
      this.prisma.user.findUnique({ where: { id: targetId }, include: { profile: true, privacy: true } }),
    ]);
    if (!me?.profile?.onboardingComplete || !target?.profile?.onboardingComplete || target.status !== 'ACTIVE') return { allowed: false, reason: 'UNAVAILABLE' };
    if (me.profile.gender === target.profile.gender) return { allowed: false, reason: 'UNAVAILABLE' };
    if (photoVerificationRequired() && !target.profile.verified) return { allowed: false, reason: 'UNAVAILABLE' };

    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: targetId }, { blockerId: targetId, blockedId: userId }] },
    });
    if (blocked) return { allowed: false, reason: 'UNAVAILABLE' };

    const [a, b] = sortedPair(userId, targetId);
    const conv = await this.prisma.conversation.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });

    if (conv && conv.status !== 'CLOSED') {
      if (conv.initiatorId === userId && conv.status === 'DECLINED') return { allowed: false, reason: 'DECLINED', conversationId: conv.id };
      if (conv.initiatorId === userId && conv.status === 'PENDING') {
        const sent = await this.prisma.message.count({ where: { conversationId: conv.id, senderId: userId } });
        if (sent >= 1) return { allowed: false, reason: 'PENDING', conversationId: conv.id };
      }
      return { allowed: true, reason: 'EXISTING', conversationId: conv.id };
    }

    const match = await this.prisma.match.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    if (match) return { allowed: true, reason: 'MATCH' };

    // A new conversation: the RECIPIENT decides who may start one.
    if (target.privacy?.hideProfile || target.privacy?.invisibleMode) return { allowed: false, reason: 'UNAVAILABLE' };

    const km = gpsDistanceKm(me.profile, target.profile);
    const nearbyOk = me.privacy?.allowNearbyMessages !== false && target.privacy?.allowNearbyMessages !== false && isNearby(km);
    if (nearbyOk) return { allowed: true, reason: 'NEARBY', distanceKm: Math.max(0.1, Math.round((km as number) * 10) / 10) };
    if (target.privacy?.allowDirectMessages === true) return { allowed: true, reason: 'DIRECT' }; // they allow requests from anyone
    if (me.privacy?.allowNearbyMessages === false && isNearby(km)) return { allowed: false, reason: 'NEARBY_OFF' };
    return { allowed: false, reason: 'NOT_ALLOWED' };
  }

  // ---------------------------------------------------------------- sending
  async send(userId: string, toUserId: string, body: string) {
    const text = body.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');

    const el = await this.eligibility(userId, toUserId);
    if (!el.allowed) throw new ForbiddenException(REASON_TEXT[el.reason] ?? 'You cannot message this member');

    const [a, b] = sortedPair(userId, toUserId);
    let conv = await this.prisma.conversation.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    const viaMatch = el.reason === 'MATCH';
    const origin = viaMatch ? 'MATCH' : el.reason === 'DIRECT' ? 'DIRECT' : 'NEARBY';

    if (!conv) {
      if (!viaMatch) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const started = await this.prisma.conversation.count({ where: { initiatorId: userId, origin: { not: 'MATCH' }, createdAt: { gt: since } } });
        if (started >= DAILY_NEARBY_REQUESTS) throw new HttpException('You have reached the daily limit of new message requests. Try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
      }
      try {
        conv = await this.prisma.conversation.create({
          data: { userAId: a, userBId: b, initiatorId: userId, origin, status: viaMatch ? 'ACCEPTED' : 'PENDING' },
        });
      } catch {
        conv = await this.prisma.conversation.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } }); // lost a race, reuse
      }
    } else if (conv.status === 'CLOSED') {
      // Previously blocked and since unblocked: start from a clean slate.
      await this.prisma.message.deleteMany({ where: { conversationId: conv.id } });
      conv = await this.prisma.conversation.update({
        where: { id: conv.id },
        data: { initiatorId: userId, origin, status: viaMatch ? 'ACCEPTED' : 'PENDING', respondedAt: null },
      });
    } else if (conv.status !== 'ACCEPTED' && (conv.initiatorId !== userId || viaMatch)) {
      // The recipient replying (or the pair having matched) counts as accepting.
      conv = await this.prisma.conversation.update({ where: { id: conv.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    }
    if (!conv) throw new NotFoundException('Conversation not found');

    const message = await this.prisma.message.create({ data: { conversationId: conv.id, senderId: userId, body: text } });
    await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: message.createdAt } });
    return { conversationId: conv.id, status: conv.status, message: { id: message.id, body: message.body, createdAt: message.createdAt, fromMe: true } };
  }

  // -------------------------------------------------------------- responding
  async respond(userId: string, conversationId: string, action: 'ACCEPT' | 'DECLINE' | 'BLOCK') {
    const conv = await this.mine(userId, conversationId);
    if (conv.initiatorId === userId) throw new ForbiddenException('Only the person who received the request can respond to it');
    const otherId = conv.userAId === userId ? conv.userBId : conv.userAId;

    if (action === 'BLOCK') {
      await this.matching.block(userId, otherId); // also closes the conversation and removes any match
      return { status: 'CLOSED', blocked: true };
    }
    if (action === 'ACCEPT') {
      if (conv.status === 'CLOSED') throw new ForbiddenException('This conversation is closed');
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      return { status: 'ACCEPTED' };
    }
    if (conv.status !== 'PENDING') throw new BadRequestException('Only a pending request can be declined');
    await this.prisma.conversation.update({ where: { id: conv.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
    return { status: 'DECLINED' };
  }

  private async mine(userId: string, id: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv || (conv.userAId !== userId && conv.userBId !== userId)) throw new NotFoundException('Conversation not found');
    return conv;
  }

  private async blockedWith(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r: any) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  // ----------------------------------------------------------------- reading
  async conversations(userId: string) {
    const [rows, blocked] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }], status: { not: 'CLOSED' } },
        orderBy: { lastMessageAt: 'desc' },
        take: 100,
        include: { userA: { include: WITH_CARD }, userB: { include: WITH_CARD }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.blockedWith(userId),
    ]);
    const ids = (rows as any[]).map((r) => r.id);
    // Count unread messages per conversation (plain query + count in code: avoids Prisma groupBy typing issues).
    const unreadMsgs = ids.length
      ? await this.prisma.message.findMany({
          where: { conversationId: { in: ids }, senderId: { not: userId }, readAt: null },
          select: { conversationId: true },
          take: 2000,
        })
      : [];
    const unread = new Map<string, number>();
    for (const m of unreadMsgs as { conversationId: string }[]) unread.set(m.conversationId, (unread.get(m.conversationId) ?? 0) + 1);

    return (rows as any[])
      .map((c) => ({ c, other: c.userAId === userId ? c.userB : c.userA }))
      .filter(({ other }) => other.status === 'ACTIVE' && other.profile && !blocked.includes(other.id))
      .map(({ c, other }) => {
        const last = c.messages[0];
        return {
          id: c.id,
          status: c.status,
          origin: c.origin,
          isInitiator: c.initiatorId === userId,
          other: toPublicView(other, null),
          lastMessage: last ? { body: last.body, createdAt: last.createdAt, fromMe: last.senderId === userId } : null,
          unread: unread.get(c.id) ?? 0,
          lastMessageAt: c.lastMessageAt,
        };
      });
  }

  async messages(userId: string, conversationId: string, after?: string) {
    const conv: any = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { userA: { include: WITH_CARD }, userB: { include: WITH_CARD } },
    });
    if (!conv || (conv.userAId !== userId && conv.userBId !== userId) || conv.status === 'CLOSED') throw new NotFoundException('Conversation not found');
    const other = conv.userAId === userId ? conv.userB : conv.userA;
    if (other.status !== 'ACTIVE' || !other.profile || (await this.blockedWith(userId)).includes(other.id)) throw new NotFoundException('Conversation not found');

    let rows: any[];
    if (after) {
      rows = await this.prisma.message.findMany({ where: { conversationId, createdAt: { gt: new Date(after) } }, orderBy: { createdAt: 'asc' }, take: 200, include: { quizInvite: true } });
    } else {
      rows = (await this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 100, include: { quizInvite: true } })).reverse();
    }
    await this.prisma.message.updateMany({ where: { conversationId, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
    const pref = await this.prisma.conversationPref.findUnique({ where: { userId_conversationId: { userId, conversationId } } });

    return {
      // myThemeKey: this member's own colour theme for this chat (null = use the app theme). The other person never sees it.
      conversation: { id: conv.id, status: conv.status, origin: conv.origin, isInitiator: conv.initiatorId === userId, other: toPublicView(other, null), myThemeKey: pref?.themeKey ?? null },
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        kind: m.kind,
        createdAt: m.createdAt,
        fromMe: m.senderId === userId,
        read: !!m.readAt,
        // Quiz events carry a small card (title, status, score once both have answered), never anyone's answers.
        quiz: m.quizInvite ? quizSummary(m.quizInvite, userId) : null,
      })),
    };
  }

  /** This member's own colour theme for one chat. null goes back to the app theme. Only they see the effect. */
  async setConversationTheme(userId: string, conversationId: string, themeKey: string | null) {
    await this.mine(userId, conversationId);
    if (themeKey !== null && !isValidThemeKey(themeKey)) throw new BadRequestException('Unknown theme');
    if (themeKey === null) {
      await this.prisma.conversationPref.deleteMany({ where: { userId, conversationId } });
      return { themeKey: null };
    }
    const key = normalizeThemeKey(themeKey);
    await this.prisma.conversationPref.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      create: { userId, conversationId, themeKey: key },
      update: { themeKey: key },
    });
    return { themeKey: key };
  }

  async unreadSummary(userId: string) {
    const [requests, unread] = await Promise.all([
      this.prisma.conversation.count({ where: { OR: [{ userAId: userId }, { userBId: userId }], status: 'PENDING', initiatorId: { not: userId } } }),
      this.prisma.message.count({
        where: { senderId: { not: userId }, readAt: null, conversation: { status: 'ACCEPTED', OR: [{ userAId: userId }, { userBId: userId }] } },
      }),
    ]);
    return { requests, unread, total: requests + unread, nearbyKm: NEARBY_MESSAGE_KM };
  }
}