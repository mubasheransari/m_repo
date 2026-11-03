import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ageFromDob } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { bestDistance } from '../common/distance';
import { effectiveOrigin, mediaPath, toPublicView } from './public-view';
import { photoVerificationRequired } from '../verification/verification.config';
import { VerificationService } from '../verification/verification.service';
import { MediaService } from '../media/media.service';
import { findCity } from '../geo/cities';
import { SetIcebreakersDto, UpdatePrivacyDto, UpsertProfileDto } from './dto/profile.dto';
import { isValidThemeKey, normalizeThemeKey } from '../common/theme';

const REQUIRED = ['firstName', 'gender', 'dateOfBirth', 'country', 'marriageTimeline'] as const;

export const ICEBREAKER_SUGGESTIONS = [
  'What are you looking for in a spouse?',
  'Tea or coffee?',
  "What's your favourite travel destination?",
  'What does a perfect weekend look like?',
  'What role does faith play in your daily life?',
  'Where do you see yourself in five years?',
];

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService, private media: MediaService, private verification: VerificationService) {}

  private completeness(p: any, mediaCount: number, icebreakers: number) {
    const checks = [
      !!p?.firstName, !!p?.gender, !!p?.dateOfBirth, !!p?.country, !!p?.city, !!p?.bio,
      !!p?.sect, !!p?.religiousness, !!p?.education, !!p?.profession, !!p?.ethnicity,
      (p?.languages?.length ?? 0) > 0, (p?.interests?.length ?? 0) >= 3, !!p?.marriageTimeline,
      mediaCount > 0, icebreakers >= 3,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        privacy: true,
        media: { orderBy: [{ type: 'asc' }, { position: 'asc' }] },
        icebreakers: { orderBy: { position: 'asc' } },
      },
    });
    const photos = user.media.filter((m: any) => m.type === 'PHOTO');
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      themeKey: user.themeKey ?? null,
      profile: user.profile && { ...user.profile, age: ageFromDob(user.profile.dateOfBirth) },
      privacy: user.privacy,
      media: user.media.map((m: any) => ({ ...m, url: mediaPath(m.url), blurredUrl: mediaPath(m.blurredUrl) })),
      icebreakers: user.icebreakers,
      completeness: this.completeness(user.profile, photos.length, user.icebreakers.length),
      verification: await this.verification.summary(userId), // status the app uses to show the verification screen
    };
  }

  /** The member's colour theme for the whole app. Saved on the server so it follows them to a new phone. */
  async setTheme(userId: string, themeKey: string | null) {
    if (themeKey !== null && !isValidThemeKey(themeKey)) throw new BadRequestException('Unknown theme');
    const key = themeKey === null ? null : normalizeThemeKey(themeKey);
    await this.prisma.user.update({ where: { id: userId }, data: { themeKey: key } });
    return { themeKey: key };
  }

  async upsertProfile(userId: string, dto: UpsertProfileDto) {
    if (dto.dateOfBirth) {
      const dob = new Date(dto.dateOfBirth);
      if (ageFromDob(dob) < 18) throw new BadRequestException('You must be at least 18 years old');
      if (ageFromDob(dob) > 99) throw new BadRequestException('Invalid date of birth');
    }
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    const { dateOfBirth, ...rest } = dto;
    const data: any = { ...rest, ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}) };

    // Coordinates come as a pair, or not at all.
    if ((dto.latitude == null) !== (dto.longitude == null)) throw new BadRequestException('Send both latitude and longitude');
    if (dto.latitude == null && (dto.city !== undefined || dto.country !== undefined)) {
      // The member typed a place instead of picking one: work the coordinates out from the city list, so Nearby,
      // distance and "within 5 km" work for them. An unknown city must not keep the previous city's coordinates.
      const city = dto.city ?? existing?.city;
      const country = dto.country ?? existing?.country;
      const hit = findCity(city, country);
      if (hit) { data.latitude = hit.lat; data.longitude = hit.lng; }
      else if (existing && (city ?? '') !== (existing.city ?? '') && existing.latitude != null) { data.latitude = null; data.longitude = null; }
    }

    if (!existing) {
      const missing = (['firstName', 'gender', 'dateOfBirth'] as const).filter((k) => !dto[k]);
      if (missing.length) throw new BadRequestException(`Required to create a profile: ${missing.join(', ')}`);
    }
    const merged = { ...existing, ...data };
    data.onboardingComplete = REQUIRED.every((k) => !!merged[k]);

    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data, languages: data.languages ?? [], interests: data.interests ?? [], lifestyle: data.lifestyle ?? [] },
      update: data,
    });
    return this.getMe(userId);
  }

  async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    // Others only ever receive the blurred copy while blur is on, so every photo must have one before it is switched on.
    if (dto.blurPhotos === true) await this.media.ensureBlurred(userId);
    return this.prisma.privacySettings.upsert({ where: { userId }, create: { userId, ...dto }, update: dto });
  }

  async setIcebreakers(userId: string, dto: SetIcebreakersDto) {
    await this.prisma.$transaction([
      this.prisma.icebreaker.deleteMany({ where: { userId } }),
      this.prisma.icebreaker.createMany({
        data: dto.items.map((it, i) => ({ userId, question: it.question.trim(), answer: it.answer.trim(), position: i })),
      }),
    ]);
    return this.prisma.icebreaker.findMany({ where: { userId }, orderBy: { position: 'asc' } });
  }

  /** Public view of someone else's profile, with all privacy rules applied. */
  async getPublicProfile(viewerId: string, targetId: string) {
    if (viewerId === targetId) return this.getMe(viewerId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { profile: true, privacy: true, media: { orderBy: { position: 'asc' } }, icebreakers: { orderBy: { position: 'asc' } } },
    });
    if (!target || target.status !== 'ACTIVE' || !target.profile?.onboardingComplete) throw new NotFoundException('Profile not found');
    if (target.privacy?.hideProfile || target.privacy?.invisibleMode) throw new NotFoundException('Profile not found');
    if (photoVerificationRequired() && !target.profile.verified) throw new NotFoundException('Profile not found');

    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: viewerId, blockedId: targetId }, { blockerId: targetId, blockedId: viewerId }] },
    });
    if (blocked) throw new NotFoundException('Profile not found');

    const viewer = await this.prisma.profile.findUnique({ where: { userId: viewerId } });
    return toPublicView(target, effectiveOrigin(viewer), bestDistance(viewer, target.profile));
  }
}
