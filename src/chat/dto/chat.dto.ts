import { IsDateString, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { THEME_KEY_RE } from '../../common/theme';
import { MAX_MESSAGE_LENGTH } from '../chat.rules';

export class SendMessageDto {
  @IsUUID() toUserId: string;
  @IsString() @MinLength(1) @MaxLength(MAX_MESSAGE_LENGTH) body: string;
}

export class RespondDto {
  @IsIn(['ACCEPT', 'DECLINE', 'BLOCK']) action: 'ACCEPT' | 'DECLINE' | 'BLOCK';
}

export class LocationDto {
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
}

export class MessagesQueryDto {
  @IsOptional() @IsDateString() after?: string;
}

export class ChatThemeDto {
  /** A preset key or #RRGGBB. null goes back to the app theme. */
  @IsOptional() @IsString() @Matches(THEME_KEY_RE, { message: 'Unknown theme' }) themeKey?: string | null;
}
