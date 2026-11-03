import { FaceEngine } from './face-engine';

/** Development only: approves everything so the rest of the app can be tested without a face service. */
export class DevEngine implements FaceEngine {
  readonly name = 'dev' as const;
  readonly automated = true;
  async verify() { return { decision: 'APPROVED' as const, score: 100 }; }
  async comparePhoto() { return 'MATCH' as const; }
}
