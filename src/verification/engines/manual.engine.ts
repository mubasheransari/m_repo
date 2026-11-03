import { FaceEngine } from './face-engine';

/** No automatic checking: every submission waits for an admin to compare the selfie with the photos. */
export class ManualEngine implements FaceEngine {
  readonly name = 'manual' as const;
  readonly automated = false;
  async verify() { return { decision: 'PENDING' as const }; }
  async comparePhoto() { return 'UNKNOWN' as const; }
}
