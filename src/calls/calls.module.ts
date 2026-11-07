import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { AgoraService } from './agora.service';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({ imports: [ChatModule], controllers: [CallsController], providers: [CallsService, AgoraService] })
export class CallsModule {}
