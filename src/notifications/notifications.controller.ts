import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../verification/verified.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { InboxQueryDto, MarkReadDto, NotificationsQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  /** OLD feed (likes / matches / messages since a time, no read state). Kept for app builds that still use it. */
  @SkipThrottle()
  @Get()
  poll(@CurrentUser() u: AuthUser, @Query() q: NotificationsQueryDto) { return this.svc.since(u.id, q.since); }

  /** The notification list: `{ items, nextCursor, unread, unreadByType }`. Each item has `read`, `target` (where to navigate) and `actor`. */
  @SkipThrottle()
  @Get('inbox')
  inbox(@CurrentUser() u: AuthUser, @Query() q: InboxQueryDto) { return this.svc.inbox(u.id, q); }

  /** Poll for local notifications: unread items newer than `since` (the previous `serverTime`), plus the unread badge numbers. */
  @SkipThrottle()
  @Get('updates')
  updates(@CurrentUser() u: AuthUser, @Query() q: NotificationsQueryDto) { return this.svc.updates(u.id, q.since); }

  @SkipThrottle()
  @Get('unread-count')
  unread(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u.id); }

  /** The member opened these notifications. */
  @Post('read')
  readMany(@CurrentUser() u: AuthUser, @Body() dto: MarkReadDto) { return this.svc.markMany(u.id, dto.ids); }

  @Post('read-all')
  readAll(@CurrentUser() u: AuthUser) { return this.svc.markAll(u.id); }

  /** The member opened this notification. */
  @Post(':id/read')
  read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(u.id, id); }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u.id, id); }
}
