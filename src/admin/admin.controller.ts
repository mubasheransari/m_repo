import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

class ListUsersDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'BANNED']) status?: string;
}
class StatusDto { @IsIn(['ACTIVE', 'SUSPENDED', 'BANNED']) status: string; }
class VerifyDto { @IsBoolean() verified: boolean; }

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('stats')
  async stats() {
    const since = new Date(Date.now() - 86_400_000);
    const [total, active, suspended, verified, newToday, male, female, onboarded, matches, likes, conversations, messages, onGlobe, pendingVerifications] = await Promise.all([
      this.prisma.user.count({ where: { role: 'USER' } }),
      this.prisma.user.count({ where: { role: 'USER', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: { in: ['SUSPENDED', 'BANNED'] } } }),
      this.prisma.profile.count({ where: { verified: true } }),
      this.prisma.user.count({ where: { role: 'USER', createdAt: { gt: since } } }),
      this.prisma.profile.count({ where: { gender: 'MALE' } }),
      this.prisma.profile.count({ where: { gender: 'FEMALE' } }),
      this.prisma.profile.count({ where: { onboardingComplete: true } }),
      this.prisma.match.count(),
      this.prisma.swipe.count({ where: { action: 'LIKE' } }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.privacySettings.count({ where: { showOnGlobe: true } }),
      this.prisma.photoVerification.count({ where: { status: 'PENDING' } }),
    ]);
    return { total, active, suspended, verified, newToday, male, female, onboarded, matches, likes, conversations, messages, onGlobe, pendingVerifications };
  }

  @Get('users')
  async users(@Query() q: ListUsersDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const search = q.search?.trim();
    const where: any = {
      role: 'USER',
      ...(q.status ? { status: q.status } : {}),
      ...(search
        ? { OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { profile: { firstName: { contains: search, mode: 'insensitive' } } },
          ] }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true, email: true, phone: true, name: true, status: true, createdAt: true, lastActiveAt: true,
          privacy: { select: { showOnGlobe: true } },
          profile: { select: { firstName: true, gender: true, country: true, city: true, verified: true, onboardingComplete: true } },
          media: { where: { type: 'PHOTO' }, orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
      }),
    ]);
    return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** Everything the panel shows in the user detail window. Never includes the password hash. */
  @Get('users/:id')
  async user(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        privacy: true,
        media: { orderBy: [{ type: 'asc' }, { position: 'asc' }] },
        verifications: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, reason: true, createdAt: true, engine: true } },
      },
    });
    if (!u) throw new NotFoundException('User not found');
    const { passwordHash, ...safe } = u as any;
    return { ...safe, hasPassword: !!passwordHash };
  }

  private async target(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    if (u.role === 'ADMIN') throw new ForbiddenException('Admins cannot be modified here');
    return u;
  }

  @Patch('users/:id/status')
  async setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    await this.target(id);
    return this.prisma.user.update({ where: { id }, data: { status: dto.status as any }, select: { id: true, status: true } });
  }

  @Patch('users/:id/verify')
  async setVerified(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyDto) {
    await this.target(id);
    const p = await this.prisma.profile.findUnique({ where: { userId: id } });
    if (!p) throw new BadRequestException('User has no profile yet');
    return this.prisma.profile.update({ where: { userId: id }, data: { verified: dto.verified }, select: { userId: true, verified: true } });
  }
}
