import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../verification/verified.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { DiscoverQueryDto, SwipeDto, TravelDto } from './dto/matching.dto';
import { MatchingService } from './matching.service';

@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller()
export class MatchingController {
  constructor(private svc: MatchingService) {}

  @Get('discover') discover(@CurrentUser() u: AuthUser, @Query() q: DiscoverQueryDto) { return this.svc.discover(u.id, q); }
  @Post('swipes') swipe(@CurrentUser() u: AuthUser, @Body() dto: SwipeDto) { return this.svc.swipe(u.id, dto.targetId, dto.action); }
  @Get('likes/received') likes(@CurrentUser() u: AuthUser) { return this.svc.likesReceived(u.id); }

  @Get('matches') matches(@CurrentUser() u: AuthUser) { return this.svc.matches(u.id); }
  @Delete('matches/:id') unmatch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.unmatch(u.id, id); }

  @Get('blocks') blocks(@CurrentUser() u: AuthUser) { return this.svc.blocks(u.id); }
  @Post('blocks/:userId') block(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.svc.block(u.id, id); }
  @Delete('blocks/:userId') unblock(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.svc.unblock(u.id, id); }

  @Put('me/travel') setTravel(@CurrentUser() u: AuthUser, @Body() dto: TravelDto) { return this.svc.setTravel(u.id, dto); }
  @Delete('me/travel') clearTravel(@CurrentUser() u: AuthUser) { return this.svc.clearTravel(u.id); }
}
