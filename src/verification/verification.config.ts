import { mkdirSync } from 'fs';
import { resolve } from 'path';

/** Photo verification is mandatory unless explicitly switched off (REQUIRE_PHOTO_VERIFICATION=false, for local testing). */
export const photoVerificationRequired = () => process.env.REQUIRE_PHOTO_VERIFICATION !== 'false';

export type EngineName = 'rekognition' | 'manual' | 'dev';

/**
 * VERIFICATION_ENGINE:
 *  - rekognition: automatic face matching with AWS Rekognition (needs AWS_REGION + AWS credentials)
 *  - manual:      selfies wait in an admin review queue (no external service needed)
 *  - dev:         approves everything (development only, refused in production)
 * Not set: rekognition when AWS credentials are present, otherwise manual.
 */
export function engineName(): EngineName {
  const v = (process.env.VERIFICATION_ENGINE || '').toLowerCase();
  if (v === 'rekognition' || v === 'manual' || v === 'dev') return v;
  return process.env.AWS_REGION && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE) ? 'rekognition' : 'manual';
}

/** Verification selfies are sensitive: they live in their own folder that is NEVER served publicly. */
export function privateDir(): string {
  const dir = resolve(process.cwd(), process.env.PRIVATE_DIR || 'private');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const MAX_ATTEMPTS_PER_DAY = 5;
export const CHALLENGE_TTL_SEC = 10 * 60;
