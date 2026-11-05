import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileVisitsService } from './profile-visits.service';

@Module({ imports: [MediaModule], controllers: [ProfileController], providers: [ProfileService, ProfileVisitsService], exports: [ProfileService, ProfileVisitsService] })
export class ProfileModule {}
