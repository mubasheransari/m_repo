import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({ imports: [MatchingModule], controllers: [ChatController], providers: [ChatService], exports: [ChatService] })
export class ChatModule {}
