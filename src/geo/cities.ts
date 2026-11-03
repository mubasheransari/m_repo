export interface City { city: string; country: string; lat: number; lng: number }

export const CITIES: City[] = [
  // Pakistan
  { city: 'Karachi', country: 'Pakistan', lat: 24.8607, lng: 67.0011 },
  { city: 'Lahore', country: 'Pakistan', lat: 31.5204, lng: 74.3587 },
  { city: 'Islamabad', country: 'Pakistan', lat: 33.6844, lng: 73.0479 },
  { city: 'Rawalpindi', country: 'Pakistan', lat: 33.5651, lng: 73.0169 },
  { city: 'Faisalabad', country: 'Pakistan', lat: 31.4504, lng: 73.135 },
  { city: 'Multan', country: 'Pakistan', lat: 30.1575, lng: 71.5249 },
  { city: 'Peshawar', country: 'Pakistan', lat: 34.0151, lng: 71.5249 },
  { city: 'Quetta', country: 'Pakistan', lat: 30.1798, lng: 66.975 },
  { city: 'Hyderabad', country: 'Pakistan', lat: 25.396, lng: 68.3578 },
  { city: 'Sialkot', country: 'Pakistan', lat: 32.4945, lng: 74.5229 },
  // Gulf & Middle East
  { city: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lng: 55.2708 },
  { city: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.4539, lng: 54.3773 },
  { city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lng: 46.6753 },
  { city: 'Jeddah', country: 'Saudi Arabia', lat: 21.4858, lng: 39.1925 },
  { city: 'Makkah', country: 'Saudi Arabia', lat: 21.3891, lng: 39.8579 },
  { city: 'Madinah', country: 'Saudi Arabia', lat: 24.5247, lng: 39.5692 },
  { city: 'Doha', country: 'Qatar', lat: 25.2854, lng: 51.531 },
  { city: 'Kuwait City', country: 'Kuwait', lat: 29.3759, lng: 47.9774 },
  { city: 'Muscat', country: 'Oman', lat: 23.588, lng: 58.3829 },
  { city: 'Manama', country: 'Bahrain', lat: 26.2285, lng: 50.586 },
  { city: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784 },
  { city: 'Cairo', country: 'Egypt', lat: 30.0444, lng: 31.2357 },
  { city: 'Amman', country: 'Jordan', lat: 31.9454, lng: 35.9284 },
  // South & South-East Asia
  { city: 'Dhaka', country: 'Bangladesh', lat: 23.8103, lng: 90.4125 },
  { city: 'Delhi', country: 'India', lat: 28.6139, lng: 77.209 },
  { city: 'Mumbai', country: 'India', lat: 19.076, lng: 72.8777 },
  { city: 'Hyderabad (India)', country: 'India', lat: 17.385, lng: 78.4867 },
  { city: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lng: 101.6869 },
  { city: 'Jakarta', country: 'Indonesia', lat: -6.2088, lng: 106.8456 },
  { city: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198 },
  // Europe
  { city: 'London', country: 'United Kingdom', lat: 51.5072, lng: -0.1276 },
  { city: 'Birmingham', country: 'United Kingdom', lat: 52.4862, lng: -1.8904 },
  { city: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426 },
  { city: 'Bradford', country: 'United Kingdom', lat: 53.795, lng: -1.7594 },
  { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { city: 'Berlin', country: 'Germany', lat: 52.52, lng: 13.405 },
  { city: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  // Americas, Oceania, Africa
  { city: 'New York', country: 'United States', lat: 40.7128, lng: -74.006 },
  { city: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298 },
  { city: 'Houston', country: 'United States', lat: 29.7604, lng: -95.3698 },
  { city: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437 },
  { city: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { city: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093 },
  { city: 'Melbourne', country: 'Australia', lat: -37.8136, lng: 144.9631 },
  { city: 'Johannesburg', country: 'South Africa', lat: -26.2041, lng: 28.0473 },
  { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792 },
];

// ---------------------------------------------------------------------------------------------------------------
// Looking a city up by the free text a member typed during sign-up ("karachi", "Karachi ", "Lahore, Pakistan"...).
// This is what gives every member map coordinates, which Nearby and the distance filter depend on.
// ---------------------------------------------------------------------------------------------------------------
const norm = (s?: string | null) =>
  (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const COUNTRY_ALIASES: Record<string, string> = {
  uae: 'united arab emirates', emirates: 'united arab emirates', ksa: 'saudi arabia', uk: 'united kingdom', england: 'united kingdom',
  britain: 'united kingdom', 'great britain': 'united kingdom', usa: 'united states', us: 'united states', america: 'united states',
  'united states of america': 'united states', turkiye: 'turkey', pak: 'pakistan',
};
const countryKey = (c?: string | null) => { const n = norm(c); return COUNTRY_ALIASES[n] ?? n; };

/** Best catalogue match for a typed city (+ optional country), or null when it is not in the list. */
export function findCity(city?: string | null, country?: string | null): City | null {
  const c = norm(city);
  if (!c) return null;
  const k = countryKey(country);
  const sameName = CITIES.filter((x) => norm(x.city) === c);
  if (!sameName.length) return null;
  if (k) {
    const exact = sameName.find((x) => countryKey(x.country) === k);
    if (exact) return exact;
    return null; // the city exists, but in another country than the one given: do not guess
  }
  return sameName.length === 1 ? sameName[0] : null; // ambiguous without a country
}
