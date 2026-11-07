import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Call as CallRow, CallStatus, CallType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicView } from '../profile/public-view';
import { AgoraService, RtcCredentials } from './agora.service';
import {
  billedSeconds, dayWindow, describeLimit, effectiveEnd, EndReason, formatDuration, hasVideoTime, HOUR_MS, MAX_CALLS_PER_HOUR,
  RING_TIMEOUT_SECONDS, remainingOf, secondsLeft, videoCapFor, videoDailyLimitSeconds, VOICE_TOKEN_TTL_SECONDS,
} from './call.rules';

const CARD = { profile: true, privacy: true, media: { orderBy: { position: 'asc' as const } } };
const OPEN: CallStatus[] = ['RINGING', 'ACTIVE'];

/** Error bodies the app can act on: `code` says what happened, `message` is ready to show. */
const coded = (statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) => ({ statusCode, code, message, ...extra });

type Outcome = 'ENDED' | 'MISSED' | 'DECLINED';

/**
 * "Two requests collided and the database refused one of them" (Serializable isolation). Prisma reports it as P2034 (binary engine)
 * or as a driver error such as TransactionWriteConflict (driver adapters); Postgres itself calls it 40001 / 40P01.
 */
const isTransactionConflict = (e: any): boolean =>
  e?.code === 'P2034' || /TransactionWriteConflict|could not serialize|deadlock detected|40001|40P01/i.test(`${e?.name ?? ''} ${e?.message ?? ''} ${e?.cause?.originalCode ?? ''}`);

@Injectable()
export class CallsService {
  private log = new Logger('Calls');

  constructor(
    private prisma: PrismaService,
    private chat: ChatService,
    private agora: AgoraService,
    private notifications: NotificationsService,
  ) {}

  // ================================================================ the daily video allowance
  /** Whole seconds of video this member has used today: finished calls plus the one running now. */
  async videoUsedSeconds(userId: string, now = new Date()): Promise<number> {
    const { start } = dayWindow(now);
    const rows = await this.prisma.call.findMany({
      where: { type: 'VIDEO', status: { in: ['ACTIVE', 'ENDED'] }, answeredAt: { gte: start }, OR: [{ callerId: userId }, { calleeId: userId }] },
      select: { status: true, durationSeconds: true, answeredAt: true, maxSeconds: true },
    });
    let used = 0;
    for (const r of rows) used += r.status === 'ENDED' || !r.answeredAt ? r.durationSeconds : billedSeconds(r.answeredAt, now, r.maxSeconds);
    return used;
  }

  /** What is left today for each of two members, in the order given. */
  private async videoRemaining(a: string, b: string, now: Date): Promise<[number, number]> {
    const limit = videoDailyLimitSeconds();
    const [ua, ub] = await Promise.all([this.videoUsedSeconds(a, now), this.videoUsedSeconds(b, now)]);
    return [remainingOf(limit, ua), remainingOf(limit, ub)];
  }

  /** The member's allowance for the screen that shows it. */
  async quota(userId: string, now = new Date()) {
    await this.sweep(userId, now);
    const limit = videoDailyLimitSeconds();
    const used = Math.min(limit, await this.videoUsedSeconds(userId, now));
    return {
      video: { limitSeconds: limit, usedSeconds: used, remainingSeconds: remainingOf(limit, used), resetsAt: dayWindow(now).end },
      voice: { unlimited: true },
      serverTime: now,
    };
  }

  private videoLimitError(who: 'me' | 'them', remaining: number, now: Date) {
    const limit = videoDailyLimitSeconds();
    const resetsAt = dayWindow(now).end;
    if (limit === 0) return new ForbiddenException(coded(403, 'VIDEO_LIMIT_REACHED', 'Video calls are not available right now. You can make a voice call instead.', { remainingSeconds: 0, resetsAt }));
    return who === 'me'
      ? new ForbiddenException(coded(403, 'VIDEO_LIMIT_REACHED', `Video calls are limited to ${describeLimit(limit)} a day, and you have used today's time. You can still make voice calls, and video is available again after the daily reset.`, { remainingSeconds: remaining, resetsAt }))
      : new ForbiddenException(coded(403, 'VIDEO_LIMIT_OTHER', 'This member has used their video call time for today. You can make a voice call instead.', { resetsAt }));
  }

  // ================================================================ starting a call
  async start(userId: string, toUserId: string, type: CallType) {
    if (userId === toUserId) throw new BadRequestException('You cannot call yourself');
    this.agora.assertConfigured();
    const now = new Date();
    await Promise.all([this.sweep(userId, now), this.sweep(toUserId, now)]); // calls nobody closed must not keep either member "busy"

    // Same people-rules as chat: a match or an accepted chat, nobody blocked, both verified.
    const conversationId = await this.chat.acceptedConversationFor(userId, toUserId, 'call');

    const recent = await this.prisma.call.count({ where: { callerId: userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } } });
    if (recent >= MAX_CALLS_PER_HOUR) throw new HttpException('You have started a lot of calls in the last hour. Please try again a little later.', HttpStatus.TOO_MANY_REQUESTS);

    if (type === 'VIDEO') {
      const limit = videoDailyLimitSeconds();
      const [mine, theirs] = await this.videoRemaining(userId, toUserId, now);
      if (!hasVideoTime(mine, limit)) throw this.videoLimitError('me', mine, now);
      if (!hasVideoTime(theirs, limit)) throw this.videoLimitError('them', theirs, now);
    }

    try {
      // Serializable: two members calling each other at the same instant cannot both succeed.
      const created = await this.prisma.$transaction(
        async (tx) => {
          const busy = await tx.call.findFirst({
            where: {
              AND: [
                { OR: [{ status: 'ACTIVE' }, { status: 'RINGING', ringExpiresAt: { gt: now } }] },
                { OR: [{ callerId: { in: [userId, toUserId] } }, { calleeId: { in: [userId, toUserId] } }] },
              ],
            },
            select: { callerId: true, calleeId: true },
          });
          if (busy) {
            const meBusy = busy.callerId === userId || busy.calleeId === userId;
            throw new ConflictException(coded(409, 'BUSY', meBusy ? 'You are already in a call.' : 'This member is on another call right now. Please try again in a moment.'));
          }
          const id = randomUUID();
          return tx.call.create({
            data: {
              id, conversationId, callerId: userId, calleeId: toUserId, type,
              channelName: `c${id.replace(/-/g, '')}`, // 33 characters, letters and digits only: valid for Agora
              ringExpiresAt: new Date(now.getTime() + RING_TIMEOUT_SECONDS * 1000),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const callee = await this.prisma.user.findUnique({ where: { id: toUserId }, include: CARD });
      // appId: the caller starts its camera preview while the phone is still ringing, before it has a token.
      return { ...this.view(created, userId, now), other: callee ? this.brief(callee) : null, appId: this.agora.publicAppId };
    } catch (e: any) {
      if (isTransactionConflict(e)) throw new ConflictException(coded(409, 'BUSY', 'Please try again in a moment.')); // lost a race with another call
      throw e;
    }
  }

  // ================================================================ ringing: who is calling me?
  /** Calls ringing for this member right now. The app polls this every few seconds. */
  async incoming(userId: string) {
    const now = new Date();
    const open = await this.sweep(userId, now);
    const ringing = open.filter((c) => c.calleeId === userId && c.status === 'RINGING');
    if (!ringing.length) return { serverTime: now, calls: [] as any[] };

    const [callers, blocked] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ringing.map((c) => c.callerId) } }, include: CARD }),
      this.blockedWith(userId),
    ]);
    const byId = new Map<string, any>(callers.map((u: any) => [u.id, u]));
    const calls = ringing
      .map((c) => ({ c, caller: byId.get(c.callerId) }))
      .filter(({ c, caller }) => caller && caller.status === 'ACTIVE' && caller.profile && !blocked.includes(c.callerId))
      .map(({ c, caller }) => ({ ...this.view(c, userId, now), other: this.brief(caller) }));
    return { serverTime: now, calls };
  }

  // ================================================================ answering
  async accept(userId: string, id: string) {
    const now = new Date();
    let call = await this.mine(userId, id);
    if (call.calleeId !== userId) throw new ForbiddenException('Only the person being called can answer');
    call = await this.settle(call, now);

    if (call.status === 'ACTIVE') return this.answered(call, userId, now); // double tap or a retry: same answer again
    if (call.status !== 'RINGING') throw new ConflictException(coded(409, 'CALL_ENDED', 'This call has already ended.', { status: call.status }));

    if (await this.isBlocked(call.callerId, call.calleeId)) {
      await this.prisma.call.updateMany({ where: { id, status: 'RINGING' }, data: { status: 'CANCELLED', endedAt: now, endReason: 'BLOCKED' } });
      throw new ConflictException(coded(409, 'CALL_ENDED', 'This call has already ended.'));
    }

    let maxSeconds: number | null = null;
    if (call.type === 'VIDEO') {
      const limit = videoDailyLimitSeconds();
      const [mine, theirs] = await this.videoRemaining(call.calleeId, call.callerId, now);
      // The allowance may have been used up since the call started ringing (it counts for both of them).
      if (!hasVideoTime(mine, limit) || !hasVideoTime(theirs, limit)) {
        await this.prisma.call.updateMany({ where: { id, status: 'RINGING' }, data: { status: 'DECLINED', endedAt: now, endReason: 'VIDEO_LIMIT', endedById: userId } });
        throw this.videoLimitError(hasVideoTime(mine, limit) ? 'them' : 'me', Math.min(mine, theirs), now);
      }
      maxSeconds = videoCapFor(mine, theirs);
    }

    const r = await this.prisma.call.updateMany({
      where: { id, status: 'RINGING', ringExpiresAt: { gt: now } },
      data: { status: 'ACTIVE', answeredAt: now, maxSeconds, callerSeenAt: now, calleeSeenAt: now },
    });
    if (r.count === 0) {
      const fresh = await this.mine(userId, id); // someone else changed it first: say how it ended
      if (fresh.status === 'ACTIVE') return this.answered(fresh, userId, now);
      throw new ConflictException(coded(409, 'CALL_ENDED', 'This call has already ended.', { status: fresh.status }));
    }
    return this.answered(await this.mine(userId, id), userId, now);
  }

  private async answered(call: CallRow, userId: string, now: Date) {
    const other = await this.prisma.user.findUnique({ where: { id: call.callerId === userId ? call.calleeId : call.callerId }, include: CARD });
    return { call: { ...this.view(call, userId, now), other: other ? this.brief(other) : null }, rtc: this.rtc(call, userId, now) };
  }

  async decline(userId: string, id: string) {
    const now = new Date();
    let call = await this.mine(userId, id);
    if (call.calleeId !== userId) throw new ForbiddenException('Only the person being called can decline');
    call = await this.settle(call, now);
    if (call.status === 'RINGING') {
      const r = await this.prisma.call.updateMany({ where: { id, status: 'RINGING' }, data: { status: 'DECLINED', endedAt: now, endReason: 'DECLINED', endedById: userId } });
      if (r.count === 1) await this.postEvent(call, 'DECLINED');
    }
    return this.view(await this.mine(userId, id), userId, now);
  }

  // ================================================================ ending
  /** Hang up. Before the call is answered the caller cancelling is a missed call for the other person. */
  async end(userId: string, id: string) {
    const now = new Date();
    let call = await this.mine(userId, id);
    call = await this.settle(call, now);

    if (call.status === 'RINGING') {
      if (call.calleeId === userId) return this.decline(userId, id);
      const r = await this.prisma.call.updateMany({ where: { id, status: 'RINGING' }, data: { status: 'CANCELLED', endedAt: now, endReason: 'CANCELLED', endedById: userId } });
      if (r.count === 1) await this.postEvent(call, 'MISSED');
    } else if (call.status === 'ACTIVE') {
      const left = secondsLeft(call, now);
      const reason: EndReason | 'HANGUP' = left === 0 ? 'TIME_LIMIT' : 'HANGUP';
      await this.finishActive(call, now, reason, userId);
    }
    return this.view(await this.mine(userId, id), userId, now);
  }

  // ================================================================ while the call is on
  /** Current state of one call (cheap: the app polls this while its call is ringing). */
  async get(userId: string, id: string) {
    const now = new Date();
    const call = await this.settle(await this.mine(userId, id), now);
    return this.view(call, userId, now);
  }

  /**
   * "I am still here." Both phones send this every few seconds during a call. It keeps the call alive, tells the phone the
   * truth about the time left, and is how a call whose other side vanished gets closed.
   */
  async heartbeat(userId: string, id: string) {
    const now = new Date();
    let call = await this.mine(userId, id);
    if (call.status === 'ACTIVE') {
      await this.prisma.call.updateMany({
        where: { id, status: 'ACTIVE' },
        data: userId === call.callerId ? { callerSeenAt: now } : { calleeSeenAt: now },
      });
      if (await this.isBlocked(call.callerId, call.calleeId)) {
        await this.finishActive(call, now, 'BLOCKED', null);
      } else {
        call = await this.mine(userId, id); // re-read with the new heartbeat before judging
        await this.settle(call, now);
      }
      call = await this.mine(userId, id);
    } else {
      call = await this.settle(call, now);
    }
    return this.view(call, userId, now);
  }

  /** Agora credentials for an answered call: the first time (the caller, who joins once the other side answered) and to renew. */
  async token(userId: string, id: string) {
    const now = new Date();
    const call = await this.settle(await this.mine(userId, id), now);
    if (call.status !== 'ACTIVE') throw new ConflictException(coded(409, 'CALL_NOT_ACTIVE', 'This call is not in progress.', { status: call.status }));
    return { rtc: this.rtc(call, userId, now), call: this.view(call, userId, now) };
  }

  // ================================================================ internals
  /** Agora credentials for `userId` in `call`. A capped call's token ends exactly when the call must end. */
  private rtc(call: CallRow, userId: string, now: Date): RtcCredentials {
    const uid = userId === call.callerId ? 1 : 2; // one channel per call, so two fixed ids are enough
    const left = secondsLeft(call, now);
    if (left !== null && left <= 0) throw new ConflictException(coded(409, 'CALL_ENDED', 'The time for this call is up.'));
    return this.agora.token(call.channelName, uid, left ?? VOICE_TOKEN_TTL_SECONDS);
  }

  /** Loads a call the member takes part in. Anyone else gets "not found", never a hint that it exists. */
  private async mine(userId: string, id: string): Promise<CallRow> {
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) throw new NotFoundException('Call not found');
    return call;
  }

  /**
   * Closes whatever should already be closed. Phones can die mid-call and serverless servers have no background timer, so this
   * runs every time a call is looked at: a ringing call past its time becomes MISSED, an active call past its cap or silent for
   * too long becomes ENDED, and its time is billed up to the moment it really ended.
   */
  private async settle(call: CallRow, now: Date): Promise<CallRow> {
    if (call.status === 'RINGING' && call.ringExpiresAt.getTime() <= now.getTime()) {
      const r = await this.prisma.call.updateMany({ where: { id: call.id, status: 'RINGING' }, data: { status: 'MISSED', endedAt: call.ringExpiresAt, endReason: 'TIMEOUT' } });
      if (r.count === 1) await this.postEvent(call, 'MISSED');
      return (await this.prisma.call.findUnique({ where: { id: call.id } })) ?? call;
    }
    if (call.status === 'ACTIVE' && call.answeredAt) {
      const end = effectiveEnd({ ...call, answeredAt: call.answeredAt }, now);
      if (end) {
        await this.finishActive(call, end.at, end.reason, null);
        return (await this.prisma.call.findUnique({ where: { id: call.id } })) ?? call;
      }
    }
    return call;
  }

  /** Settles every unfinished call of a member and returns the ones that are really still open. */
  private async sweep(userId: string, now: Date): Promise<CallRow[]> {
    const rows = await this.prisma.call.findMany({ where: { status: { in: OPEN }, OR: [{ callerId: userId }, { calleeId: userId }] }, take: 20 });
    const open: CallRow[] = [];
    for (const row of rows) {
      const settled = await this.settle(row, now);
      if (settled.status === 'RINGING' || settled.status === 'ACTIVE') open.push(settled);
    }
    return open;
  }

  /** ACTIVE -> ENDED, billing the time. Only the first of several simultaneous closers wins, so the chat event is posted once. */
  private async finishActive(call: CallRow, endedAt: Date, reason: EndReason | 'HANGUP' | 'BLOCKED', endedById: string | null) {
    if (!call.answeredAt) return;
    const at = endedAt.getTime() < call.answeredAt.getTime() ? call.answeredAt : endedAt;
    const seconds = billedSeconds(call.answeredAt, at, call.maxSeconds);
    const r = await this.prisma.call.updateMany({
      where: { id: call.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: at, endReason: reason, endedById, durationSeconds: seconds },
    });
    if (r.count === 1) await this.postEvent(call, 'ENDED', seconds);
  }

  /** The line that appears in the chat ("Video call · 3:25", "Missed voice call"). Never allowed to break the call itself. */
  private async postEvent(call: Pick<CallRow, 'id' | 'conversationId' | 'callerId' | 'calleeId' | 'type'>, outcome: Outcome, seconds = 0) {
    try {
      const conv = await this.prisma.conversation.findUnique({ where: { id: call.conversationId }, select: { status: true } });
      if (!conv || conv.status === 'CLOSED') return; // blocked / closed: nothing to show
      const video = call.type === 'VIDEO';
      const icon = video ? '📹' : '📞';
      const word = video ? 'video' : 'voice';
      const body =
        outcome === 'ENDED' ? `${icon} ${video ? 'Video' : 'Voice'} call${seconds > 0 ? ` · ${formatDuration(seconds)}` : ''}`
        : outcome === 'MISSED' ? `${icon} Missed ${word} call`
        : `${icon} Declined ${word} call`;
      const at = new Date();
      await this.prisma.$transaction([
        // Sent "by" the caller. Only a missed call stays unread for the other person (it then counts in their badge).
        this.prisma.message.create({ data: { conversationId: call.conversationId, senderId: call.callerId, body, kind: `CALL_${call.type}_${outcome}`, createdAt: at, readAt: outcome === 'MISSED' ? null : at } }),
        this.prisma.conversation.update({ where: { id: call.conversationId }, data: { lastMessageAt: at } }),
      ]);
      if (outcome === 'MISSED') await this.notifications.missedCall(call.calleeId, call.callerId, call.conversationId, call.type);
    } catch (e: any) {
      this.log.warn(`call event for ${call.id} failed: ${e?.message ?? e}`);
    }
  }

  /** What the app needs to know about a call. Times are the server's, so a wrong phone clock changes nothing. */
  private view(c: CallRow, userId: string, now: Date) {
    return {
      id: c.id,
      type: c.type,
      status: c.status,
      conversationId: c.conversationId,
      iAmCaller: c.callerId === userId,
      createdAt: c.createdAt,
      ringExpiresAt: c.ringExpiresAt,
      ringSecondsLeft: c.status === 'RINGING' ? Math.max(0, Math.ceil((c.ringExpiresAt.getTime() - now.getTime()) / 1000)) : null,
      answeredAt: c.answeredAt,
      endedAt: c.endedAt,
      endReason: c.endReason,
      durationSeconds: c.durationSeconds,
      maxSeconds: c.maxSeconds, // the cap on this call (video), or null
      remainingSeconds: c.status === 'ACTIVE' ? secondsLeft(c, now) : null, // seconds until the cap ends it, or null when there is none
      serverTime: now,
    };
  }

  /** Name + the photo other members may see. Never anything else. */
  private brief(user: any) {
    const v = toPublicView(user, null, null);
    const photo = v.media.find((m: any) => m.type === 'PHOTO');
    return { id: v.id as string, firstName: v.firstName as string, verified: !!v.verified, photo: photo ? (photo.url as string) : null };
  }

  private async isBlocked(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.block.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { id: true } });
    return !!hit;
  }

  private async blockedWith(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }
}
