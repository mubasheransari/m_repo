import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';

/**
 * Password hashing with Node's built-in scrypt (no native add-on to install).
 * Stored as  scrypt$<salt hex>$<hash hex>.  A fresh random salt is used for every password.
 */
const KEYLEN = 64;

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, KEYLEN, (e, key) => (e ? reject(e) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await derive(password, Buffer.from(parts[1], 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Used to spend the same time when the email is unknown, so response time does not reveal which emails have accounts. */
export const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(KEYLEN);
