import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendQuizDto {
  @IsUUID() toUserId: string;
  @IsString() @MaxLength(60) quizId: string;
  /** {questionId: optionId} for every question. Checked in detail by the service. */
  @IsObject() answers: Record<string, string>;
}

export class AnswerQuizDto {
  @IsObject() answers: Record<string, string>;
}

export class QuizListQueryDto {
  @IsOptional() @IsUUID() withUserId?: string;
}
