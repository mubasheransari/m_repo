import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedGuard } from '../verification/verified.guard';
import { SetIcebreakersDto, SetThemeDto, UpdatePrivacyDto, UpsertProfileDto } from './dto/profile.dto';
import { VisitorsQueryDto } from './dto/profile.dto';
import { ProfileVisitsService } from './profile-visits.service';
import { ICEBREAKER_SUGGESTIONS, ProfileService } from './profile.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ProfileController {
  constructor(private profiles: ProfileService, private visits: ProfileVisitsService) {}

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.profiles.getMe(u.id); }
  @Put('me/profile') upsert(@CurrentUser() u: AuthUser, @Body() dto: UpsertProfileDto) { return this.profiles.upsertProfile(u.id, dto); }
  @Patch('me/privacy') privacy(@CurrentUser() u: AuthUser, @Body() dto: UpdatePrivacyDto) { return this.profiles.updatePrivacy(u.id, dto); }
  @Put('me/icebreakers') icebreakers(@CurrentUser() u: AuthUser, @Body() dto: SetIcebreakersDto) { return this.profiles.setIcebreakers(u.id, dto); }
  @Put('me/theme') theme(@CurrentUser() u: AuthUser, @Body() dto: SetThemeDto) { return this.profiles.setTheme(u.id, dto.themeKey ?? null); }
  /** Who opened my profile: `{ total, unique, last7Days, visitors: [{ visitCount, lastVisitAt, profile }] }`. */
  @UseGuards(VerifiedGuard)
  @Get('me/visitors') visitors(@CurrentUser() u: AuthUser, @Query() q: VisitorsQueryDto) { return this.visits.list(u.id, q.limit); }
  @Get('icebreakers/suggestions') suggestions() { return ICEBREAKER_SUGGESTIONS; }
  @UseGuards(VerifiedGuard)
  @Get('profiles/:id') view(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.profiles.getPublicProfile(u.id, id); }
}
