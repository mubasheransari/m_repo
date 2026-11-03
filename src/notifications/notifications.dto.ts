import { IsDateString, IsOptional } from 'class-validator';

export class NotificationsQueryDto {
  /** ISO time of the last poll (use the `serverTime` returned by the previous call). Omit on the first call. */
  @IsOptional() @IsDateString() since?: string;
}
