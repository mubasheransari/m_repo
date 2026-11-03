import { Gesture } from '../gesture';

export type EngineDecision = { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; score?: number; reason?: string };

export interface FaceEngine {
  readonly name: 'rekognition' | 'manual' | 'dev';
  /** true when the engine can approve/reject on its own */
  readonly automated: boolean;
  /** Checks the live selfie (one face, doing the gesture) and that EVERY photo shows the same person. */
  verify(input: { selfie: Buffer; photos: Buffer[]; gesture: Gesture }): Promise<EngineDecision>;
  /** After approval: does a newly uploaded photo show the verified person? UNKNOWN = a human must look. */
  comparePhoto(selfie: Buffer, photo: Buffer): Promise<'MATCH' | 'NO_MATCH' | 'UNKNOWN'>;
}

export const FACE_ENGINE = Symbol('FACE_ENGINE');
