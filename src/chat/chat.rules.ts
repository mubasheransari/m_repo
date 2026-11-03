import { haversineKm } from '../common/geo';

/** Members within this distance (by GPS) may send each other a message request. */
export const NEARBY_MESSAGE_KM = 5;
/** A GPS position older than this is ignored, so only people who are actually around count. */
export const GPS_FRESH_MS = 6 * 60 * 60 * 1000;
/** Anti-spam: new message requests (nearby or direct, not matches) one member may start per 24 hours. */
export const DAILY_NEARBY_REQUESTS = 10;
export const MAX_MESSAGE_LENGTH = 1000;

export const sortedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** Positions are rounded to ~110 m before they are stored, so exact addresses are never kept. */
export const coarse = (n: number) => Math.round(n * 1000) / 1000;

export function freshGps(p: any, now = Date.now()): { lat: number; lng: number } | null {
  if (!p || p.gpsLatitude == null || p.gpsLongitude == null || !p.gpsUpdatedAt) return null;
  if (now - new Date(p.gpsUpdatedAt).getTime() > GPS_FRESH_MS) return null;
  return { lat: p.gpsLatitude, lng: p.gpsLongitude };
}

/** Distance in km between two profiles' fresh GPS positions, or null if either is missing/stale. */
export function gpsDistanceKm(a: any, b: any, now = Date.now()): number | null {
  const ga = freshGps(a, now);
  const gb = freshGps(b, now);
  if (!ga || !gb) return null;
  return haversineKm(ga.lat, ga.lng, gb.lat, gb.lng);
}

export const isNearby = (km: number | null) => km != null && km <= NEARBY_MESSAGE_KM;

export const REASON_TEXT: Record<string, string> = {
  SELF: 'You cannot message yourself',
  UNAVAILABLE: 'This member is not available',
  NOT_ALLOWED: `This member only accepts messages from people they have matched with, or from members within ${NEARBY_MESSAGE_KM} km. Like them to match, or turn on your location if you are nearby.`,
  PENDING: 'Your message request is waiting for them to accept. You can chat once they do.',
  DECLINED: 'This member did not accept your message request.',
  NEARBY_OFF: 'Turn on "Allow nearby messages" in your privacy settings to message people nearby.',
};
