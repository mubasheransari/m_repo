import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../admin/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AllowUnverified } from './verified.guard';
import { VerificationService } from './verification.service';

class SelfieDto { @IsString() @Length(20, 2000) challenge: string; }
class ListDto {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
class RejectDto { @IsString() @Length(3, 300) reason: string; }

const selfieUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype) || file.mimetype === 'application/octet-stream' ? cb(null, true) : cb(new BadRequestException('Selfie must be an image'), false)),
});

@AllowUnverified()
@UseGuards(JwtAuthGuard)
@Controller('verification')
export class VerificationController {
  constructor(private svc: VerificationService) {}

  /** Where the member stands: NOT_STARTED | PENDING | APPROVED | REJECTED (+ reason). */
  @Get() status(@CurrentUser() u: AuthUser) { return this.svc.summary(u.id); }

  /** Step 1: get a random gesture to perform in the selfie. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('challenge') challenge(@CurrentUser() u: AuthUser) { return this.svc.challenge(u.id); }

  /** Step 2: send the live selfie (multipart field "file") together with the challenge token. */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('selfie')
  @UseInterceptors(selfieUpload)
  selfie(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() dto: SelfieDto) { return this.svc.submitSelfie(u.id, file, dto.challenge); }
}

/** Review queue for the "manual" engine (and a record of automatic decisions). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/verifications')
export class VerificationAdminController {
  constructor(private svc: VerificationService) {}

  @Get() list(@Query() q: ListDto) { return this.svc.listForReview(q.status ?? 'PENDING', q.page, q.limit); }

  @Get(':id/selfie')
  async selfie(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: any) {
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' });
    return new StreamableFile(createReadStream(await this.svc.selfiePath(id)));
  }

  @Post(':id/approve') approve(@CurrentUser() a: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.review(id, a.id, true); }
  @Post(':id/reject') reject(@CurrentUser() a: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) { return this.svc.review(id, a.id, false, dto.reason); }
}
