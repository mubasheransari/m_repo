/**
 * Image addresses.
 *
 * The database stores media as host-independent paths ("/uploads/<file>") so the data survives a change of
 * server address. The mobile app, however, hands whatever it receives straight to Image.network(), which
 * needs a complete address. So every API response is passed through `absolutizeMedia`, which turns those
 * paths into full URLs built from the address the client actually used to reach the API
 * (emulator: http://10.0.2.2:4000, real phone: http://<LAN-IP>:4000, production: https://api.example.com).
 */

const MEDIA_RE = /^(?:https?:\/\/[^/]+)?(\/uploads\/[^?#]+)/i;
const MEDIA_KEYS = new Set(['url', 'blurredUrl', 'photo']); // 'photo' = the small avatar in notification items

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export function hostnameOf(origin: string): string {
  try { return new URL(origin).hostname.toLowerCase(); } catch { return ''; }
}

/** A configured PUBLIC_BASE_URL is only trusted when it is a real, reachable address (not localhost). */
export function configuredOrigin(publicBaseUrl?: string | null): string | null {
  const v = (publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (!v) return null;
  const host = hostnameOf(v);
  if (!host || LOOPBACK.has(host)) return null;
  return v;
}

interface ReqLike { protocol?: string; headers?: Record<string, any>; get?: (h: string) => string | undefined }

const first = (v: unknown): string => String(Array.isArray(v) ? v[0] : v ?? '').split(',')[0].trim();

/** The address the client used to reach this server. */
export function requestOrigin(req: ReqLike | undefined): string | null {
  if (!req) return null;
  const h = req.headers || {};
  const host = first(h['x-forwarded-host']) || first(h['host']) || first(req.get?.('host'));
  if (!host) return null;
  const proto = first(h['x-forwarded-proto']) || req.protocol || 'http';
  return `${proto}://${host}`;
}

/** PUBLIC_BASE_URL (when it is a real address) wins; otherwise whatever address the client called us on. */
export function resolveOrigin(req: ReqLike | undefined, publicBaseUrl?: string | null): string | null {
  return configuredOrigin(publicBaseUrl) ?? requestOrigin(req);
}

/** "/uploads/x.jpg" or "http://localhost:4000/uploads/x.jpg" -> "<origin>/uploads/x.jpg". Other values are returned unchanged. */
export function toAbsoluteMediaUrl(value: string, origin: string | null): string {
  const m = MEDIA_RE.exec(value);
  if (!m || !origin) return value;
  return `${origin.replace(/\/+$/, '')}${m[1]}`;
}

const isPlain = (v: any) => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** Deep-copies a response body, rewriting every media `url` / `blurredUrl` string. Dates, buffers and streams are left alone. */
export function absolutizeMedia<T>(body: T, origin: string | null): T {
  if (!origin) return body;
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isPlain(v)) return v;
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = MEDIA_KEYS.has(k) && typeof val === 'string' ? toAbsoluteMediaUrl(val, origin) : walk(val);
    }
    return out;
  };
  return walk(body);
}
