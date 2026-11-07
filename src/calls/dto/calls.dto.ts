import { IsIn, IsUUID } from 'class-validator';

export class StartCallDto {
  @IsUUID() toUserId: string;
  @IsIn(['VOICE', 'VIDEO']) type: 'VOICE' | 'VIDEO';
}
