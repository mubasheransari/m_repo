import { gpsDistanceKm } from '../chat/chat.rules';
import { haversineKm } from './geo';

const hasHome = (p: any) => p && p.latitude != null && p.longitude != null;

/** How a distance was measured: live GPS (accurate to ~100 m), Travel Mode, or between the two members' home cities (approximate). */
export type DistanceSource = 'gps' | 'travel' | 'city';
export interface Dist { km: number | null; source: DistanceSource | null }

/**
 * Best available distance between two profiles, and how it was measured:
 *  1. Travel Mode: from the travel city to the other member's home city
 *  2. both members share a fresh GPS position (most accurate)
 *  3. both members have a home city (approximate: two people in one city are ~0 km apart)
 */
export function bestDistance(me: any, other: any): Dist {
  if (!me || !other) return { km: null, source: null };
  if (me.travelActive && me.travelLatitude != null && me.travelLongitude != null && hasHome(other)) {
    return { km: haversineKm(me.travelLatitude, me.travelLongitude, other.latitude, other.longitude), source: 'travel' };
  }
  const gps = gpsDistanceKm(me, other);
  if (gps != null) return { km: gps, source: 'gps' };
  if (hasHome(me) && hasHome(other)) return { km: haversineKm(me.latitude, me.longitude, other.latitude, other.longitude), source: 'city' };
  return { km: null, source: null };
}

export const bestDistanceKm = (me: any, other: any): number | null => bestDistance(me, other).km;
