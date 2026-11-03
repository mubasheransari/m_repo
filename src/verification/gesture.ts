import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

/**
 * The member must do a random gesture in the selfie, chosen by the server. A stolen photo cannot know it in advance.
 * (Gestures are mirror-proof: no "left"/"right", because front cameras mirror pictures.)
 */
export const GESTURES = {
  SMILE: 'Smile with your teeth showing',
  OPEN_MOUTH: 'Open your mouth wide',
  TURN_SIDE: 'Turn your head to one side',
} as const;
export type Gesture = keyof typeof GESTURES;

export const randomGesture = (): Gesture => {
  const all = Object.keys(GESTURES) as Gesture[];
  return all[randomBytes(1)[0] % all.length];
};

interface Payload { u: string; g: Gesture; n: string; e: number }

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

/** A tamper-proof, expiring challenge bound to one member. Nothing needs to be stored until the selfie arrives. */
export function issueChallenge(userId: string, secret: string, ttlSec: number, now = Date.now()) {
  const p: Payload = { u: userId, g: randomGesture(), n: randomUUID(), e: now + ttlSec * 1000 };
  const body = b64(JSON.stringify(p));
  return { token: `${body}.${sign(body, secret)}`, gesture: p.g, nonce: p.n, expiresAt: new Date(p.e) };
}

export function readChallenge(token: string, userId: string, secret: string, now = Date.now()): { gesture: Gesture; nonce: string } | 'EXPIRED' | null {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let p: Payload;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (p.u !== userId || !(p.g in GESTURES) || !p.n) return null;
  if (p.e < now) return 'EXPIRED';
  return { gesture: p.g, nonce: p.n };
}
