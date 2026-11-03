import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import sharp from 'sharp';
import { uploadDir } from '../media/upload-dir';
import { PrismaService } from '../prisma/prisma.service';
import { FACE_ENGINE, FaceEngine } from './engines/face-engine';
import { GESTURES, issueChallenge, readChallenge } from './gesture';
import { CHALLENGE_TTL_SEC, MAX_ATTEMPTS_PER_DAY, photoVerificationRequired, privateDir } from './verification.config';

export type VerificationState = 'NOT_REQUIRED' | 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

@Injectable()
export class VerificationService implements OnModuleInit {
  private readonly log = new Logger('Verification');

  constructor(private prisma: PrismaService, private config: ConfigService, @Inject(FACE_ENGINE) private engine: FaceEngine) {}

  onModuleInit() {
    this.log.log(photoVerificationRequired() ? `Photo verification is REQUIRED (engine: ${this.engine.name})` : 'Photo verification is switched OFF (REQUIRE_PHOTO_VERIFICATION=false)');
  }

  get required() { return photoVerificationRequired(); }
  private get secret() { return this.config.get<string>('VERIFICATION_SECRET') || this.config.get<string>('JWT_ACCESS_SECRET') || 'dev-secret'; }

  async isVerified(userId: string): Promise<boolean> {
    if (!this.required) return true;
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { verified: true } });
    return !!p?.verified;
  }

  private async photoFiles(userId: string) {
    const rows = await this.prisma.media.findMany({ where: { userId, type: 'PHOTO' }, orderBy: { position: 'asc' }, select: { url: true } });
    return rows.map((r: { url: string }) => join(uploadDir(), basename(r.url)));
  }

  /** Everything the app needs to show the right verification screen. */
  async summary(userId: string) {
    if (!this.required) return { required: false, status: 'NOT_REQUIRED' as VerificationState, verified: true };
    const [profile, last, photos, attempts] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { verified: true } }),
      this.prisma.photoVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.media.count({ where: { userId, type: 'PHOTO' } }),
      this.prisma.photoVerification.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    ]);
    const verified = !!profile?.verified;
    let status: VerificationState = 'NOT_STARTED';
    let reason: string | null = null;
    if (verified) status = 'APPROVED';
    else if (last?.status === 'PENDING') status = 'PENDING';
    else if (last?.status === 'REJECTED') { status = 'REJECTED'; reason = last.reason; }
    else if (last?.status === 'APPROVED') reason = 'Your photos changed, so please verify again.';
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS_PER_DAY - attempts);
    return {
      required: true,
      status,
      verified,
      reason,
      engine: this.engine.name, // 'manual' => a person reviews it, so it can take a while
      hasPhotos: photos > 0,
      attemptsLeft,
      canSubmit: !verified && status !== 'PENDING' && photos > 0 && attemptsLeft > 0,
    };
  }

  /** Step 1: the server picks a gesture. The selfie must show it. */
  async challenge(userId: string) {
    await this.assertCanStart(userId);
    const c = issueChallenge(userId, this.secret, CHALLENGE_TTL_SEC);
    return { token: c.token, gesture: c.gesture, instruction: GESTURES[c.gesture], expiresInSeconds: CHALLENGE_TTL_SEC };
  }

  private async assertCanStart(userId: string) {
    if (!this.required) throw new BadRequestException('Photo verification is not required');
    const s: any = await this.summary(userId);
    if (s.verified) throw new ConflictException('You are already verified');
    if (s.status === 'PENDING') throw new ConflictException('Your verification is already being reviewed');
    if (!s.hasPhotos) throw new BadRequestException('Add at least one photo of yourself first, then verify');
    if (s.attemptsLeft <= 0) throw new HttpException('Too many attempts today. Please try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** Step 2: the live selfie. Compared with EVERY photo on the profile. */
  async submitSelfie(userId: string, file: Express.Multer.File | undefined, token: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Selfie is required');
    await this.assertCanStart(userId);
    const ch = readChallenge(token, userId, this.secret);
    if (ch === 'EXPIRED') throw new BadRequestException('That took too long. Start again to get a new gesture.');
    if (!ch) throw new BadRequestException('Invalid verification request. Start again.');

    let selfie: Buffer;
    try {
      selfie = await sharp(file.buffer).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    } catch {
      throw new BadRequestException('Invalid image file');
    }
    const files = await this.photoFiles(userId);
    const photos: Buffer[] = [];
    for (const f of files) photos.push(await fs.readFile(f).catch(() => { throw new BadRequestException('One of your photos could not be read. Remove it and upload it again.'); }));

    let result;
    try {
      result = await this.engine.verify({ selfie, photos, gesture: ch.gesture });
    } catch (e) {
      this.log.error(`Face service failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Verification is temporarily unavailable. Please try again in a few minutes.'); // not counted as an attempt
    }

    const selfieFile = `${randomUUID()}.jpg`;
    await fs.writeFile(join(privateDir(), selfieFile), selfie);
    try {
      await this.prisma.photoVerification.create({
        data: { userId, status: result.decision, nonce: ch.nonce, gesture: ch.gesture, selfieFile, matchScore: result.score ?? null, reason: result.reason ?? null, engine: this.engine.name },
      });
    } catch (e: any) {
      await fs.unlink(join(privateDir(), selfieFile)).catch(() => undefined);
      if (e?.code === 'P2002') throw new BadRequestException('This verification request was already used. Start again.');
      throw e;
    }
    if (result.decision === 'APPROVED') await this.prisma.profile.update({ where: { userId }, data: { verified: true } });
    return { decision: result.decision, ...(await this.summary(userId)) };
  }

  // ------------------------------------------------------------------ photos added later
  /**
   * A verified member adds another photo: it must show the same person. Automatic engines check it right away
   * (a different person is refused); manual review means the member verifies again.
   */
  async checkNewPhoto(userId: string, photoPath: string): Promise<'OK' | 'REVERIFY'> {
    if (!this.required) return 'OK';
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { verified: true } });
    if (!profile?.verified) return 'OK'; // not verified yet: every photo is checked together at verification time
    const ref = await this.prisma.photoVerification.findFirst({ where: { userId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' } });
    if (!ref) return 'OK'; // verified by an admin without a selfie: nothing to compare with
    if (!this.engine.automated) return 'REVERIFY';
    let verdict: 'MATCH' | 'NO_MATCH' | 'UNKNOWN';
    try {
      const selfie = await fs.readFile(join(privateDir(), ref.selfieFile));
      verdict = await this.engine.comparePhoto(selfie, await fs.readFile(photoPath));
    } catch (e) {
      this.log.error(`Photo check failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Could not check this photo right now. Please try again in a few minutes.');
    }
    if (verdict === 'NO_MATCH') throw new BadRequestException('This photo does not appear to show you. Only photos of yourself are allowed.');
    return verdict === 'UNKNOWN' ? 'REVERIFY' : 'OK';
  }

  requireReverification(userId: string) {
    return this.prisma.profile.update({ where: { userId }, data: { verified: false } });
  }

  // ------------------------------------------------------------------ admin review
  async listForReview(status: 'PENDING' | 'APPROVED' | 'REJECTED', page = 1, limit = 20) {
    const where = { status };
    const [total, rows] = await Promise.all([
      this.prisma.photoVerification.count({ where }),
      this.prisma.photoVerification.findMany({
        where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * limit, take: limit,
        include: { user: { select: { id: true, email: true, phone: true, profile: { select: { firstName: true } }, media: { where: { type: 'PHOTO' }, orderBy: { position: 'asc' }, select: { id: true, url: true } } } } },
      }),
    ]);
    return {
      total, page,
      items: (rows as any[]).map((r) => ({
        id: r.id, status: r.status, gesture: r.gesture, engine: r.engine, matchScore: r.matchScore, reason: r.reason, createdAt: r.createdAt,
        user: { id: r.user.id, email: r.user.email, phone: r.user.phone, firstName: r.user.profile?.firstName ?? null },
        selfie: `/api/admin/verifications/${r.id}/selfie`, // needs the admin token
        photos: r.user.media.map((m: any) => ({ id: m.id, url: m.url })),
      })),
    };
  }

  async selfiePath(id: string) {
    const v = await this.prisma.photoVerification.findUnique({ where: { id }, select: { selfieFile: true } });
    if (!v) throw new NotFoundException();
    return join(privateDir(), basename(v.selfieFile));
  }

  async review(id: string, adminId: string, approve: boolean, reason?: string) {
    const v = await this.prisma.photoVerification.findUnique({ where: { id } });
    if (!v) throw new NotFoundException();
    if (v.status !== 'PENDING') throw new ConflictException(`Already ${v.status.toLowerCase()}`);
    if (!approve && !(reason && reason.trim().length >= 3)) throw new BadRequestException('Give the member a reason');
    await this.prisma.$transaction([
      this.prisma.photoVerification.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', reason: approve ? null : reason!.trim(), reviewedById: adminId, reviewedAt: new Date() } }),
      this.prisma.profile.update({ where: { userId: v.userId }, data: { verified: approve } }),
    ]);
    return { id, status: approve ? 'APPROVED' : 'REJECTED' };
  }
}
