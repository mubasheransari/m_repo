import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({ imports: [ChatModule], controllers: [QuizController], providers: [QuizService] })
export class QuizModule {}
