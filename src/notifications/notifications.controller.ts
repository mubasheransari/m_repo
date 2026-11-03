import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../verification/verified.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { NotificationsQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  /** Poll with `since` = the `serverTime` of the previous response. Light query, so exempt from the general rate limit. */
  @SkipThrottle()
  @Get()
  poll(@CurrentUser() u: AuthUser, @Query() q: NotificationsQueryDto) { return this.svc.since(u.id, q.since); }
}
