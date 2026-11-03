import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OtpSender } from './otp-sender';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { PasswordLoginDto, RegisterDto } from './dto/auth.dto';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SEC = 60;
const ACCESS_TTL_SEC = 15 * 60;

/** 'signup' = must be a new account, 'login' = must already exist, 'auto' = legacy behaviour (creates the account if needed). */
export type AuthPurpose = 'signup' | 'login' | 'auto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private sender: OtpSender,
  ) {}

  private normalize(identifier: string): { email?: string; phone?: string; key: string } {
    const v = identifier.trim();
    return v.includes('@')
      ? { email: v.toLowerCase(), key: v.toLowerCase() }
      : { phone: v.replace(/\s/g, ''), key: v.replace(/\s/g, '') };
  }

  private hash(code: string, key: string) {
    return createHash('sha256').update(`${code}:${key}:${this.config.get('OTP_SECRET')}`).digest('hex');
  }

  private findUser(n: { email?: string; phone?: string }) {
    return this.prisma.user.findFirst({ where: n.email ? { email: n.email } : { phone: n.phone }, include: { profile: true } });
  }

  async requestOtp(identifier: string, purpose: AuthPurpose = 'auto') {
    const n = this.normalize(identifier);
    const { key } = n;

    // Say clearly whether the member should sign up or log in, before any code is sent.
    if (purpose !== 'auto') {
      const existing = await this.findUser(n);
      if (purpose === 'signup' && existing) throw new ConflictException('An account with this email or phone already exists. Please log in instead.');
      if (purpose === 'login' && !existing) throw new NotFoundException('No account found for this email or phone. Please sign up first.');
      if (existing && existing.status !== 'ACTIVE') throw new UnauthorizedException('This account is not active');
    }

    const last = await this.prisma.otp.findFirst({ where: { identifier: key }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (last) {
      const wait = RESEND_AFTER_SEC - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
      if (wait > 0) {
        throw new HttpException({ statusCode: 429, message: `Please wait ${wait} seconds before requesting another code`, retryAfterSeconds: wait }, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otp.create({
      data: { identifier: key, codeHash: this.hash(code, key), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    await this.sender.send(key, code);
    const dev = this.config.get('NODE_ENV') !== 'production';
    return { sent: true, resendAfterSeconds: RESEND_AFTER_SEC, expiresInSeconds: OTP_TTL_MS / 1000, ...(dev ? { devCode: code } : {}) };
  }

  async verifyOtp(identifier: string, code: string, purpose: AuthPurpose = 'auto') {
    const n = this.normalize(identifier);
    const otp = await this.prisma.otp.findFirst({
      where: { identifier: n.key, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException('Code expired or invalid. Request a new one.');


    const a = Buffer.from(this.hash(code, n.key));
    const b = Buffer.from(otp.codeHash);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      await this.prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - otp.attempts - 1;
      throw new UnauthorizedException(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.');
    }
    let user = await this.findUser(n);
    // Check the account rules BEFORE the code is consumed, so a wrong choice (login vs sign up) does not waste the code.
    if (purpose === 'signup' && user) throw new ConflictException('An account with this email or phone already exists. Please log in instead.');
    if (purpose === 'login' && !user) throw new NotFoundException('No account found for this email or phone. Please sign up first.');
    await this.prisma.otp.update({ where: { id: otp.id }, data: { consumed: true } });
    const isNewUser = !user;
    if (!user) {
      user = await this.prisma.user.create({
        data: { email: n.email, phone: n.phone, privacy: { create: {} } },
        include: { profile: true },
      });
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('This account is not active');
    const admins = (this.config.get<string>('ADMIN_EMAILS') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (n.email && admins.includes(n.email) && user.role !== 'ADMIN') {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' }, include: { profile: true } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    return {
      ...this.issueTokens(user.id, user.role),
      expiresInSeconds: ACCESS_TTL_SEC,
      isNewUser,
      onboardingComplete: user.profile?.onboardingComplete ?? false,
    };
  }

  // ------------------------------------------------------------ email + password
  private isAdminEmail(email?: string | null) {
    const admins = (this.config.get<string>('ADMIN_EMAILS') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    return !!email && admins.includes(email.toLowerCase());
  }

  private async startSession(user: any, isNewUser: boolean) {
    if (this.isAdminEmail(user.email) && user.role !== 'ADMIN') {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' }, include: { profile: true } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return {
      ...this.issueTokens(user.id, user.role),
      expiresInSeconds: ACCESS_TTL_SEC,
      isNewUser,
      role: user.role,
      onboardingComplete: user.profile?.onboardingComplete ?? false,
    };
  }

  /** Creates the account and signs the member in straight away. */
  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) throw new BadRequestException('Passwords do not match');
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('An account with this email already exists. Please log in.');
    }
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash, privacy: { create: {} } },
        include: { profile: true },
      });
      return this.startSession(user, true);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('An account with this email already exists. Please log in.');
      throw e;
    }
  }

  async loginPassword(dto: PasswordLoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { profile: true } });
    // Always do the hashing work, so an unknown email takes as long as a wrong password.
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) throw new UnauthorizedException('Incorrect email or password');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('This account is not active');
    return this.startSession(user, false);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, { secret: this.config.get('JWT_REFRESH_SECRET') });
      if (payload.type !== 'refresh') throw new Error();
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'ACTIVE') throw new Error();
      return this.issueTokens(user.id, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private issueTokens(userId: string, role: string) {
    const accessToken = this.jwt.sign({ sub: userId, role }, { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: '15m' });
    const refreshToken = this.jwt.sign({ sub: userId, type: 'refresh' }, { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: '30d' });
    return { accessToken, refreshToken };
  }
}
