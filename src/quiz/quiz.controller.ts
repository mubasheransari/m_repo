import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { VerifiedGuard } from '../verification/verified.guard';
import { AnswerQuizDto, QuizListQueryDto, SendQuizDto } from './quiz.dto';
import { QuizService } from './quiz.service';

@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller()
export class QuizController {
  constructor(private quiz: QuizService) {}

  @Get('quizzes') catalog() { return this.quiz.catalog(); }
  @Get('quizzes/:quizId') definition(@Param('quizId') quizId: string) { return this.quiz.definition(quizId); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('quiz-invites') send(@CurrentUser() u: AuthUser, @Body() dto: SendQuizDto) { return this.quiz.send(u.id, dto.toUserId, dto.quizId, dto.answers); }

  @Get('quiz-invites') list(@CurrentUser() u: AuthUser, @Query() q: QuizListQueryDto) { return this.quiz.list(u.id, q.withUserId); }
  @Get('quiz-invites/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.quiz.get(u.id, id); }

  @Post('quiz-invites/:id/answer') answer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerQuizDto) { return this.quiz.answer(u.id, id, dto.answers); }
  @Post('quiz-invites/:id/decline') decline(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.quiz.decline(u.id, id); }
  @Post('quiz-invites/:id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.quiz.cancel(u.id, id); }
}
