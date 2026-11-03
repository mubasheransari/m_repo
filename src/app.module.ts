import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { MediaUrlInterceptor } from './common/media-url.interceptor';
import { ChatModule } from './chat/chat.module';
import { GeoModule } from './geo/geo.module';
import { GlobeModule } from './globe/globe.module';
import { MatchingModule } from './matching/matching.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VerificationModule } from './verification/verification.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { QuizModule } from './quiz/quiz.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // DISABLE_THROTTLE=true is for local testing only (never set it in production).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }], skipIf: () => process.env.DISABLE_THROTTLE === 'true' }),
    PrismaModule,
    AuthModule,
    ProfileModule,
    MediaModule,
    AdminModule,
    GeoModule,
    NotificationsModule,
    VerificationModule,
    MatchingModule,
    ChatModule,
    GlobeModule,
    QuizModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MediaUrlInterceptor }, // image paths -> full URLs the phone can load
  ],
})
export class AppModule {}
