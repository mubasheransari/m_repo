/**
 * Explains WHY profiles are (not) showing in Discover. Run from miora-backend:
 *   npx tsx prisma/diagnose.ts me@email.com                  -> summary for your account
 *   npx tsx prisma/diagnose.ts me@email.com other@email.com  -> why can "me" (not) see "other"?
 *   npx tsx prisma/diagnose.ts me@email.com --reset-swipes   -> (dev only) forget everyone you liked/passed
 * Use an email, or a phone number in +923001234567 format.
 */
import { PrismaClient } from '@prisma/client';
import { haversineKm } from '../src/common/geo';
import { freshGps, GPS_FRESH_MS, NEARBY_MESSAGE_KM } from '../src/chat/chat.rules';

const prisma = new PrismaClient();
const REQUIRED = ['firstName', 'gender', 'dateOfBirth', 'country', 'marriageTimeline'];
const yn = (b: boolean) => (b ? 'YES' : ' NO');
const line = (b: boolean, text: string) => console.log(`  [${yn(b)}] ${text}`);

async function findUser(id: string): Promise<any> {
  const v = id.trim();
  return prisma.user.findFirst({ where: v.includes('@') ? { email: v.toLowerCase() } : { phone: v }, include: { profile: true, privacy: true } });
}
const missing = (p: any) => REQUIRED.filter((k) => !p?.[k]);
const cityKm = (a: any, b: any) => (a?.latitude != null && a?.longitude != null && b?.latitude != null && b?.longitude != null ? haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) : null);
const gpsKm = (a: any, b: any) => {
  const ga = freshGps(a), gb = freshGps(b);
  return ga && gb ? haversineKm(ga.lat, ga.lng, gb.lat, gb.lng) : null;
};

async function myBlocks(meId: string): Promise<Set<string>> {
  const rows: any[] = await prisma.block.findMany({ where: { OR: [{ blockerId: meId }, { blockedId: meId }] } });
  return new Set(rows.map((b) => (b.blockerId === meId ? b.blockedId : b.blockerId)));
}

async function pair(me: any, other: any) {
  const p = other.profile;
  console.log(`\nCan ${me.email ?? me.phone} see ${other.email ?? other.phone} in Discover?\n`);
  const fields = missing(p);
  line(other.status === 'ACTIVE', `their account is active (status: ${other.status})`);
  line(!!p?.onboardingComplete, `their profile is complete${fields.length ? ' (missing: ' + fields.join(', ') + ')' : p ? '' : ' (no profile yet, they must finish onboarding)'}`);
  line(!!p && p.gender !== me.profile.gender, `opposite gender (you: ${me.profile.gender}, them: ${p?.gender}). Discover only shows the opposite gender`);
  line(!(other.privacy?.hideProfile || other.privacy?.invisibleMode), `they have not turned on Hide profile / Invisible mode`);
  line(other.privacy?.allowDirectMessages === true, `they accept direct message requests from anyone (if NO: you can only message them after a match, or when you are within ${NEARBY_MESSAGE_KM} km)`);
  const blocked = (await myBlocks(me.id)).has(other.id);
  line(!blocked, 'neither of you blocked the other');
  const sw = await prisma.swipe.findUnique({ where: { fromId_toId: { fromId: me.id, toId: other.id } } });
  line(!sw, `you have not already liked/passed them${sw ? ` (you chose ${sw.action}; they will not come back in For you / Worldwide)` : ''}`);

  const city = cityKm(me.profile, p);
  const gps = gpsKm(me.profile, p);
  console.log('\n  Per tab:');
  const base = other.status === 'ACTIVE' && !!p?.onboardingComplete && p.gender !== me.profile.gender && !(other.privacy?.hideProfile || other.privacy?.invisibleMode) && !blocked;
  line(base && !sw, 'For you / Worldwide');
  line(base && !sw && city != null && city <= 50, `Nearby (needs both home cities set and within 50 km; distance now: ${city == null ? 'unknown, one of you has no city set' : city.toFixed(1) + ' km'})`);
  line(base && gps != null && gps <= NEARBY_MESSAGE_KM && other.privacy?.allowNearbyMessages !== false && me.privacy?.allowNearbyMessages !== false,
    `Within ${NEARBY_MESSAGE_KM} km (needs fresh GPS from both in the last ${GPS_FRESH_MS / 3600000} h and "Allow nearby messages" on; GPS distance now: ${gps == null ? 'unknown, missing or older than 6 h' : gps.toFixed(1) + ' km'})`);
}

async function summary(me: any) {
  const all: any[] = await prisma.user.findMany({ where: { role: 'USER' }, include: { profile: true, privacy: true }, take: 5000 });
  const swiped = new Set((await prisma.swipe.findMany({ where: { fromId: me.id }, select: { toId: true } })).map((s: any) => s.toId));
  const blocked = await myBlocks(me.id);

  console.log('\nYour account');
  line(!!me.profile, 'you have a profile');
  const m = missing(me.profile);
  line(!!me.profile?.onboardingComplete, `your profile is complete${m.length ? ' (missing: ' + m.join(', ') + ')' : ''}. Discover refuses to load until it is`);
  console.log(`      gender: ${me.profile?.gender} | city: ${me.profile?.city ?? 'not set'} | home location: ${me.profile?.latitude != null ? 'set' : 'NOT set'} | GPS: ${freshGps(me.profile) ? 'fresh' : 'none / older than 6 h'}`);
  console.log(`      Hide profile: ${!!me.privacy?.hideProfile} | Invisible: ${!!me.privacy?.invisibleMode} | Allow nearby messages: ${me.privacy?.allowNearbyMessages !== false}`);

  let pool = all.filter((u) => u.id !== me.id);
  console.log(`\nOther members in the database: ${pool.length}`);
  const step = (label: string, fn: (u: any) => boolean) => { pool = pool.filter(fn); console.log(`  ${String(pool.length).padStart(4)}  after: ${label}`); };
  step('account is active', (u) => u.status === 'ACTIVE');
  step('profile is complete', (u) => !!u.profile?.onboardingComplete);
  step(`opposite gender to you (${me.profile?.gender})`, (u) => u.profile.gender !== me.profile?.gender);
  step('not hidden / invisible', (u) => !(u.privacy?.hideProfile || u.privacy?.invisibleMode));
  step('not blocked', (u) => !blocked.has(u.id));
  const fresh = pool.filter((u) => !swiped.has(u.id));
  console.log(`  ${String(fresh.length).padStart(4)}  after: not already liked/passed by you   <- this is what "For you" and "Worldwide" can show`);
  const near = fresh.filter((u) => { const d = cityKm(me.profile, u.profile); return d != null && d <= 50; });
  const close = pool.filter((u) => { const d = gpsKm(me.profile, u.profile); return d != null && d <= NEARBY_MESSAGE_KM && u.privacy?.allowNearbyMessages !== false; });
  console.log(`  ${String(near.length).padStart(4)}  would show in "Nearby" (within 50 km of your home city)`);
  console.log(`  ${String(close.length).padStart(4)}  would show in "Within 5 km" (fresh GPS, within 5 km)`);

  console.log('\nWhat to do');
  if (!me.profile?.onboardingComplete) console.log('  - Finish onboarding in the app first (name, gender, date of birth, country, marriage timeline).');
  else if (all.length <= 1) console.log('  - You are the only member in this database. Run:  npm run seed -- your@email.com');
  else if (pool.length === 0) console.log('  - Nobody passes the filters above. Check the step where the number drops to 0 (usually gender or profile not complete).');
  else if (fresh.length === 0) console.log('  - You already liked/passed everyone. For testing run:  npx tsx prisma/diagnose.ts your@email.com --reset-swipes');
  else console.log('  - There ARE profiles to show. In the app press the filter icon > Reset, choose "For you" or "Worldwide", and pull to refresh. If still empty, check the API address the app uses.');
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const [meId, otherId] = args.filter((a) => !a.startsWith('--'));
  if (!meId) { console.log('Usage: npx tsx prisma/diagnose.ts <your email|phone> [other email|phone] [--reset-swipes]'); return; }
  const me = await findUser(meId);
  if (!me) { console.log(`No account found for "${meId}". Log in once in the app with that exact email first.`); return; }
  if (!me.profile) { console.log('That account has no profile yet. Finish onboarding in the app first.'); return; }

  if (flags.includes('--reset-swipes')) {
    const r = await prisma.swipe.deleteMany({ where: { fromId: me.id } });
    console.log(`Deleted ${r.count} of your likes/passes. Everyone can show up again.`);
  }
  if (otherId) {
    const other = await findUser(otherId);
    if (!other) { console.log(`No account found for "${otherId}".`); return; }
    await pair(me, other);
  } else {
    await summary(me);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
