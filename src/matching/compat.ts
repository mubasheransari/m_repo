const REL = ['LEARNING', 'MODERATE', 'PRACTISING', 'VERY_PRACTISING'];
const TL = ['ASAP', 'WITHIN_6_MONTHS', 'WITHIN_1_YEAR', 'WITHIN_2_YEARS'];

const SECT_LABEL: Record<string, string> = { SUNNI: 'Sunni', SHIA: 'Shia', JUST_MUSLIM: 'Muslim', OTHER: 'the same sect' };

/**
 * Transparent 0-100 compatibility score between two profiles, plus human-readable reasons.
 * Weights: timeline 20, sect 15, practice 15, interests 15, languages 10, children 10, proximity 10, verified 5.
 */
export function scoreCompat(me: any, other: any, distanceKm: number | null): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: [number, string][] = [];

  // Marriage timeline (20)
  const ta = TL.indexOf(me.marriageTimeline);
  const tb = TL.indexOf(other.marriageTimeline);
  if (ta >= 0 && tb >= 0) {
    const pts = Math.max(0, 20 - Math.abs(ta - tb) * 7);
    score += pts;
    if (pts >= 20) reasons.push([pts, 'Looking to marry in a similar timeframe']);
  } else score += 10;

  // Sect (15)
  if (me.sect && other.sect) {
    if (me.sect === other.sect) { score += 15; reasons.push([15, me.sect === 'OTHER' ? 'Same sect' : `Both ${SECT_LABEL[me.sect] ?? 'the same sect'}`]); }
    else if (me.sect === 'JUST_MUSLIM' || other.sect === 'JUST_MUSLIM') score += 9;
    else score += 3;
  } else score += 8;

  // Level of practice (15)
  const ra = REL.indexOf(me.religiousness);
  const rb = REL.indexOf(other.religiousness);
  if (ra >= 0 && rb >= 0) {
    const pts = Math.max(0, 15 - Math.abs(ra - rb) * 5);
    score += pts;
    if (pts >= 15) reasons.push([pts, 'Similar level of practice']);
  } else score += 7;

  // Interests (15)
  const sharedInterests = (me.interests || []).filter((i: string) => (other.interests || []).includes(i));
  const ipts = Math.min(15, sharedInterests.length * 5);
  score += ipts;
  if (sharedInterests.length) reasons.push([ipts, `You both like ${sharedInterests.slice(0, 2).join(' & ')}`]);

  // Languages (10)
  const sharedLang = (me.languages || []).filter((l: string) => (other.languages || []).includes(l));
  if (sharedLang.length) { score += 10; reasons.push([6, `You both speak ${sharedLang.slice(0, 2).join(' & ')}`]); }
  else if (!(me.languages || []).length || !(other.languages || []).length) score += 5;

  // Children (10)
  if (me.wantsChildren != null && other.wantsChildren != null) {
    if (me.wantsChildren === other.wantsChildren) { score += 10; reasons.push([7, me.wantsChildren ? 'Both want children' : 'Same view on children']); }
  } else score += 5;

  // Proximity (10)
  if (distanceKm == null) score += 5;
  else if (distanceKm <= 25) { score += 10; reasons.push([8, 'Lives close to you']); }
  else if (distanceKm <= 100) score += 8;
  else if (distanceKm <= 500) score += 5;
  else score += 2;

  // Verified (5)
  if (other.verified) score += 5;

  reasons.sort((a, b) => b[0] - a[0]);
  return { score: Math.min(100, Math.round(score)), reasons: reasons.slice(0, 3).map((r) => r[1]) };
}

/** Date-of-birth bounds for an age range. */
export function dobBounds(minAge?: number, maxAge?: number) {
  const now = new Date();
  const out: { gte?: Date; lte?: Date } = {};
  if (minAge) out.lte = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  if (maxAge) { const d = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate()); d.setDate(d.getDate() + 1); out.gte = d; }
  return out;
}

/** Bounding box (degrees) around a point for a radius in km. */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { latMin: lat - dLat, latMax: lat + dLat, lngMin: lng - dLng, lngMax: lng + dLng };
}
