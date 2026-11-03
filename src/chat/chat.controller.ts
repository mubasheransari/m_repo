import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowUnverified, VerifiedGuard } from '../verification/verified.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ChatService } from './chat.service';
import { ChatThemeDto, LocationDto, MessagesQueryDto, RespondDto, SendMessageDto } from './dto/chat.dto';

@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller()
export class ChatController {
  constructor(private chat: ChatService) {}

  @AllowUnverified()
  @Put('me/location') setLocation(@CurrentUser() u: AuthUser, @Body() dto: LocationDto) { return this.chat.setLocation(u.id, dto.latitude, dto.longitude); }
  @AllowUnverified()
  @Delete('me/location') clearLocation(@CurrentUser() u: AuthUser) { return this.chat.clearLocation(u.id); }

  @Get('chat/can-message/:userId') can(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) id: string) { return this.chat.eligibility(u.id, id); }
  @Get('chat/unread') unread(@CurrentUser() u: AuthUser) { return this.chat.unreadSummary(u.id); }
  @Get('chat/conversations') list(@CurrentUser() u: AuthUser) { return this.chat.conversations(u.id); }

  @Get('chat/conversations/:id/messages')
  messages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQueryDto) { return this.chat.messages(u.id, id, q.after); }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('chat/messages') send(@CurrentUser() u: AuthUser, @Body() dto: SendMessageDto) { return this.chat.send(u.id, dto.toUserId, dto.body); }

  @Put('chat/conversations/:id/theme')
  chatTheme(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChatThemeDto) { return this.chat.setConversationTheme(u.id, id, dto.themeKey ?? null); }

  @Post('chat/conversations/:id/respond')
  respond(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondDto) { return this.chat.respond(u.id, id, dto.action); }
}
