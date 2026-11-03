import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { absolutizeMedia, resolveOrigin } from './media-url';

/** Applied globally: every JSON response leaves the server with complete, loadable image addresses. */
@Injectable()
export class MediaUrlInterceptor implements NestInterceptor {
  constructor(private config: ConfigService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const origin = resolveOrigin(req, this.config.get<string>('PUBLIC_BASE_URL'));
    return next.handle().pipe(map((body) => absolutizeMedia(body, origin)));
  }
}
