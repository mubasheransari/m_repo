import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerificationService } from './verification.service';

export const ALLOW_UNVERIFIED = 'allowUnverified';
/** Marks an endpoint that members may use before their photos are verified (profile, photos, verification itself). */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

/**
 * Use after JwtAuthGuard. Until a member's photos are verified, every feature endpoint answers 403 with
 * code VERIFICATION_REQUIRED, so skipping the verification screen in the app gets a member nowhere.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private reflector: Reflector, private verification: VerificationService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.verification.required) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, [ctx.getHandler(), ctx.getClass()])) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || user.role === 'ADMIN') return true;
    if (await this.verification.isVerified(user.id)) return true;
    throw new ForbiddenException({ statusCode: 403, code: 'VERIFICATION_REQUIRED', message: 'Verify your photos to continue' });
  }
}
