import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
/**
 * ONE place that decides where uploaded files live. Evaluated lazily (per call) so it always sees the value
 * loaded from .env; the uploader, the media service and the static file server therefore can never disagree.
 */
export function uploadDir(): string {
  const base = process.env.VERCEL ? tmpdir() : process.cwd();
  const dir = resolve(base, process.env.UPLOAD_DIR || 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}
export const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/m4a': '.m4a', 'audio/x-m4a': '.m4a',
  'audio/wav': '.wav', 'audio/webm': '.webm', 'audio/ogg': '.ogg',
};
