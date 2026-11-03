import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser { id: string; role: 'USER' | 'ADMIN'; }

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
