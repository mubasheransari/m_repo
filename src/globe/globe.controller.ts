import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { VerifiedGuard } from '../verification/verified.guard';
import { SetGlobeDto } from './globe.dto';
import { GlobeService } from './globe.service';

@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller()
export class GlobeController {
  constructor(private globe: GlobeService) {}

  /** People sharing their location. 403 GLOBE_OFF when the caller does not share theirs. */
  @Get('globe') people(@CurrentUser() u: AuthUser) { return this.globe.people(u.id); }

  /** "Show my location" toggle. */
  @Put('me/globe') set(@CurrentUser() u: AuthUser, @Body() dto: SetGlobeDto) {
    return this.globe.setSharing(u.id, dto.enabled, dto.latitude, dto.longitude);
  }
}
