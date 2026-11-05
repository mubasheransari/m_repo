import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class NotificationsQueryDto {
  /** ISO time of the last poll (use the `serverTime` returned by the previous call). Omit on the first call. */
  @IsOptional() @IsDateString() since?: string;
}

export class InboxQueryDto {
  /** Page size (default 30, max 100). */
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) @Max(100) limit?: number;
  /** `nextCursor` from the previous page. */
  @IsOptional() @IsDateString() cursor?: string;
  /** Only unread notifications. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean() unreadOnly?: boolean;
}

export class MarkReadDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) ids: string[];
}
