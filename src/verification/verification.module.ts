import { Global, Module } from '@nestjs/common';
import { DevEngine } from './engines/dev.engine';
import { FACE_ENGINE } from './engines/face-engine';
import { ManualEngine } from './engines/manual.engine';
import { RekognitionEngine } from './engines/rekognition.engine';
import { VerificationAdminController, VerificationController } from './verification.controller';
import { engineName } from './verification.config';
import { VerificationService } from './verification.service';
import { VerifiedGuard } from './verified.guard';

@Global()
@Module({
  controllers: [VerificationController, VerificationAdminController],
  providers: [
    {
      provide: FACE_ENGINE,
      useFactory: () => {
        const name = engineName();
        if (name === 'dev' && process.env.NODE_ENV === 'production') throw new Error('VERIFICATION_ENGINE=dev is not allowed in production');
        return name === 'rekognition' ? new RekognitionEngine() : name === 'dev' ? new DevEngine() : new ManualEngine();
      },
    },
    VerificationService,
    VerifiedGuard,
  ],
  exports: [VerificationService, VerifiedGuard],
})
export class VerificationModule {}
