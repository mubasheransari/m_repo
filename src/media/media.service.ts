import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationService } from '../verification/verification.service';
import { uploadDir } from './upload-dir';

type MediaType = 'PHOTO' | 'VIDEO' | 'VOICE';
const LIMITS: Record<MediaType, number> = { PHOTO: 6, VIDEO: 1, VOICE: 1 };
const PHOTO_MAX_PX = 1440; // longest side of a stored photo

@Injectable()
export class MediaService implements OnApplicationBootstrap {
  private readonly log = new Logger('Media');

  constructor(private prisma: PrismaService, private verification: VerificationService) {}

  // Stored as a path, not a full address, so it keeps working when the server address changes.
  // The API turns it into a complete URL on the way out (see common/media-url.ts).
  private urlFor(filename: string) { return `/uploads/${filename}`; }
  private fileOf(url: string) { return join(uploadDir(), basename(url)); }
  private async exists(path: string) { return fs.access(path).then(() => true, () => false); }

  /**
   * The blurred copy gets its OWN random name. It used to be "blur-<original name>.jpg", which let anyone
   * work out the address of the sharp original and bypass the blur.
   */
  private async makeBlur(sourcePath: string): Promise<string> {
    const name = `blur-${randomUUID()}.jpg`;
    await sharp(sourcePath).rotate().resize(480).blur(24).jpeg({ quality: 60 }).toFile(join(uploadDir(), name));
    return this.urlFor(name);
  }

  async add(userId: string, type: MediaType, file: Express.Multer.File, isPrivate = false) {
    const existing = await this.prisma.media.findMany({ where: { userId, type }, select: { position: true } });
    if (existing.length >= LIMITS[type]) {
      await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException(`You can upload at most ${LIMITS[type]} ${type.toLowerCase()}(s)`);
    }
    const position = existing.reduce((m: number, r: { position: number }) => Math.max(m, r.position), -1) + 1;

    let blurredUrl: string | undefined;
    let filename = file.filename;
    if (type === 'PHOTO') {
      // Rejects anything that is not a real image, shrinks it to a sensible size (phone photos are often 5-12 MB, which makes
      // every card and list load slowly), and prepares the copy other people see when blur is on.
      try {
        filename = `${randomUUID()}.jpg`;
        await sharp(file.path).rotate().resize({ width: PHOTO_MAX_PX, height: PHOTO_MAX_PX, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true }).toFile(join(uploadDir(), filename));
        await fs.unlink(file.path).catch(() => undefined);
        blurredUrl = await this.makeBlur(join(uploadDir(), filename));
      } catch {
        await fs.unlink(file.path).catch(() => undefined);
        if (filename !== file.filename) await fs.unlink(join(uploadDir(), filename)).catch(() => undefined);
        throw new BadRequestException('Invalid image file');
      }
    }

    let reverify = false;
    if (type === 'PHOTO') {
      try {
        // Already verified: the new photo must show the same person (or, with manual review, they verify again).
        reverify = (await this.verification.checkNewPhoto(userId, join(uploadDir(), filename))) === 'REVERIFY';
      } catch (e) {
        for (const u of [this.urlFor(filename), blurredUrl]) if (u) await fs.unlink(this.fileOf(u)).catch(() => undefined);
        throw e;
      }
    }

    const created = await this.prisma.media.create({
      data: { userId, type, url: this.urlFor(filename), blurredUrl, isPrivate: type === 'PHOTO' ? isPrivate : false, position },
    });
    if (reverify) await this.verification.requireReverification(userId);
    return created;
  }

  async update(userId: string, id: string, data: { isPrivate?: boolean; position?: number }) {
    const m = await this.prisma.media.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    if (m.userId !== userId) throw new ForbiddenException();
    if (m.type !== 'PHOTO' && data.isPrivate) throw new BadRequestException('Only photos can be private');
    return this.prisma.media.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    const m = await this.prisma.media.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    if (m.userId !== userId) throw new ForbiddenException();
    await this.prisma.media.delete({ where: { id } });
    for (const u of [m.url, m.blurredUrl]) {
      if (u) await fs.unlink(this.fileOf(u)).catch(() => undefined);
    }
    return { deleted: true };
  }

  /**
   * Makes sure every photo has a usable blurred copy (missing, deleted from disk, or using the old guessable name).
   * Without it, a member who turns blur on would have those photos hidden from everyone. Safe to run repeatedly.
   * Returns how many photos were repaired.
   */
  async ensureBlurred(userId?: string): Promise<number> {
    const rows = await this.prisma.media.findMany({ where: { type: 'PHOTO', ...(userId ? { userId } : {}) }, select: { id: true, url: true, blurredUrl: true } });
    let fixed = 0;
    for (const m of rows as { id: string; url: string; blurredUrl: string | null }[]) {
      const guessable = !!m.blurredUrl && basename(m.blurredUrl) === `blur-${basename(m.url)}.jpg`;
      const ok = !!m.blurredUrl && !guessable && (await this.exists(this.fileOf(m.blurredUrl)));
      if (ok) continue;
      const src = this.fileOf(m.url);
      if (!(await this.exists(src))) { this.log.warn(`Original file missing for photo ${m.id}; cannot blur it`); continue; }
      try {
        const blurredUrl = await this.makeBlur(src);
        await this.prisma.media.update({ where: { id: m.id }, data: { blurredUrl } });
        if (m.blurredUrl) await fs.unlink(this.fileOf(m.blurredUrl)).catch(() => undefined);
        fixed++;
      } catch (e) {
        this.log.warn(`Could not blur photo ${m.id}: ${(e as Error).message}`);
      }
    }
    return fixed;
  }

  onApplicationBootstrap() {
    // In the background so a large library never delays start-up.
    this.ensureBlurred()
      .then((n) => n && this.log.log(`Repaired ${n} blurred photo cop${n === 1 ? 'y' : 'ies'}`))
      .catch((e) => this.log.warn(`Blur check skipped: ${e.message}`));
  }
}
