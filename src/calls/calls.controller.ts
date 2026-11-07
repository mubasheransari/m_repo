import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { VerifiedGuard } from '../verification/verified.guard';
import { CallsService } from './calls.service';
import { StartCallDto } from './dto/calls.dto';

/**
 * Voice and video calls (Agora). Signalling is plain HTTP that the app polls (the same way notifications work), so it runs on a
 * serverless host. Keep `quota` and `incoming` ABOVE `:id`, or they would be read as a call id.
 */
@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('calls')
export class CallsController {
  constructor(private calls: CallsService) {}

  /** My video allowance today: {video: {limitSeconds, usedSeconds, remainingSeconds, resetsAt}, voice: {unlimited}}. */
  @SkipThrottle()
  @Get('quota') quota(@CurrentUser() u: AuthUser) { return this.calls.quota(u.id); }

  /** Calls ringing for me right now: {serverTime, calls: [{id, type, other, ringSecondsLeft, ...}]}. Poll every 2-3 s. */
  @SkipThrottle()
  @Get('incoming') incoming(@CurrentUser() u: AuthUser) { return this.calls.incoming(u.id); }

  /** Start ringing someone. 403 VIDEO_LIMIT_REACHED / VIDEO_LIMIT_OTHER when the daily video time is used up, 409 BUSY. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post() start(@CurrentUser() u: AuthUser, @Body() dto: StartCallDto) { return this.calls.start(u.id, dto.toUserId, dto.type); }

  /** State of one call. The caller polls this (about every 1.5 s) while waiting for an answer. */
  @SkipThrottle()
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.calls.get(u.id, id); }

  /** Answer. Returns {call, rtc} where rtc = {appId, channel, uid, token, expiresInSeconds} to join Agora with. */
  @Post(':id/accept') accept(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.calls.accept(u.id, id); }

  @Post(':id/decline') decline(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.calls.decline(u.id, id); }

  /** Hang up (or cancel while it is still ringing). Safe to call twice. */
  @Post(':id/end') end(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.calls.end(u.id, id); }

  /** Agora credentials for an answered call: the caller's first token, and renewals for everyone. */
  @Post(':id/token') token(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.calls.token(u.id, id); }

  /** Sent by both phones every ~5 s during a call. Returns the call state, including remainingSeconds. */
  @SkipThrottle()
  @Post(':id/heartbeat') heartbeat(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.calls.heartbeat(u.id, id); }
}
