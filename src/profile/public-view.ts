import { ageFromDob, haversineKm } from '../common/geo';
import { Dist, DistanceSource } from '../common/distance';

export interface Origin { lat: number; lng: number }

/** Where a user is "searching from": their travel destination if Travel Mode is on, otherwise home. */
export function effectiveOrigin(p: any): Origin | null {
  if (!p) return null;
  if (p.travelActive && p.travelLatitude != null && p.travelLongitude != null) return { lat: p.travelLatitude, lng: p.travelLongitude };
  if (p.latitude != null && p.longitude != null) return { lat: p.latitude, lng: p.longitude };
  return null;
}

/**
 * Media is always sent as a host-independent path ("/uploads/<file>"). The phone adds the server address it
 * already uses for the API, so images work on emulators, real phones and any network.
 * Old rows that were saved as "http://localhost:4000/uploads/<file>" are converted here too.
 */
export function mediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf('/uploads/');
  return i >= 0 ? url.slice(i) : url;
}

/**
 * The ONLY place that turns a user record into what other people may see.
 * Private photos never leave the server; blurred users only expose the blurred copy;
 * exact coordinates are never exposed. `km` (when given) is the already-measured distance.
 */
/**
 * Honest distance text. Live-GPS distances are shown to 0.1 km under 10 km ("0.4 km", "3.2 km").
 * City-to-city distances are only approximate (two people in one city measure ~0 km), so they are never shown as "1 km":
 * the same city reads "In your city", otherwise "about N km".
 */
export function formatDistance(raw: number | null, source: DistanceSource | null) {
  const none = { distanceKm: null as number | null, distanceLabel: null as string | null, distanceSource: null as DistanceSource | null };
  if (raw == null || !isFinite(raw) || source == null) return none;
  if (source === 'gps') {
    const km = raw < 10 ? Math.max(0.1, Math.round(raw * 10) / 10) : Math.round(raw);
    return { distanceKm: km, distanceLabel: raw < 0.2 ? 'Less than 200 m away' : `${km} km away`, distanceSource: source };
  }
  if (raw < 1) return { distanceKm: null, distanceLabel: 'In your city', distanceSource: source };
  const km = Math.round(raw);
  return { distanceKm: km, distanceLabel: `About ${km} km away`, distanceSource: source };
}

export function toPublicView(target: any, origin?: Origin | null, km?: number | null | Dist) {
  const p = target.profile;
  const privacy = target.privacy;

  let raw: number | null = null;
  let source: DistanceSource | null = null;
  if (km !== undefined && km !== null && typeof km === 'object') { raw = km.km; source = km.source; }
  else if (km !== undefined) { raw = km; source = km == null ? null : 'gps'; }
  else if (origin && p.latitude != null && p.longitude != null) { raw = haversineKm(origin.lat, origin.lng, p.latitude, p.longitude); source = 'city'; }
  const d = privacy?.showDistance !== false ? formatDistance(raw, source) : { distanceKm: null, distanceLabel: null, distanceSource: null };
  const { distanceKm, distanceLabel, distanceSource } = d;

  const blur = !!privacy?.blurPhotos;
  const media = (target.media || [])
    .filter((m: any) => !(m.type === 'PHOTO' && m.isPrivate))
    .filter((m: any) => !(m.type === 'PHOTO' && blur && !m.blurredUrl))
    .map((m: any) => ({
      id: m.id,
      type: m.type,
      url: mediaPath(m.type === 'PHOTO' && blur ? m.blurredUrl : m.url),
      blurred: m.type === 'PHOTO' && blur,
    }));

  return {
    id: target.id,
    firstName: p.firstName,
    age: ageFromDob(p.dateOfBirth),
    gender: p.gender,
    city: p.city,
    country: p.country,
    distanceKm,
    distanceLabel, // ready-to-show text, e.g. "0.4 km away", "3.2 km away", "In your city"
    distanceSource, // 'gps' (accurate) | 'travel' | 'city' (approximate) | null
    bio: p.bio,
    sect: p.sect,
    religiousness: p.religiousness,
    education: p.education,
    profession: p.profession,
    ethnicity: p.ethnicity,
    languages: p.languages,
    interests: p.interests,
    lifestyle: p.lifestyle,
    marriageIntention: p.marriageIntention,
    marriageTimeline: p.marriageTimeline,
    wantsChildren: p.wantsChildren,
    verified: p.verified,
    photosBlurred: blur, // true => every photo in `media` is the blurred copy (media[].blurred is set too)
    acceptsDirectMessages: privacy?.allowDirectMessages === true,
    media,
    hasPrivatePhotos: (target.media || []).some((m: any) => m.type === 'PHOTO' && m.isPrivate),
    icebreakers: (target.icebreakers || []).map(({ id, question, answer }: any) => ({ id, question, answer })),
  };
}
