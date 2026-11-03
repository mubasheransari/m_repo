/**
 * Creates 20 demo members so Discover has people to show.
 *   npm run seed                       -> demo members only
 *   npm run seed -- you@example.com    -> also makes 6 demo members "like" YOUR account,
 *                                         so swiping right on them gives an instant match.
 *   npm run seed -- you@example.com 24.8607 67.0011
 *                                      -> also places demo members around that GPS point
 *                                         (6 within 1-4 km, 1 at 12 km) so you can test the
 *                                         "message anyone within 5 km" feature. Re-run it to
 *                                         refresh their location (GPS positions expire after 6 h).
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { hashPassword } from '../src/auth/password';
import { CITIES } from '../src/geo/cities';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const PALETTE = [['#0F3D33', '#1B5E4F'], ['#7A3B52', '#B4536A'], ['#4A3F6B', '#7C6BB0'], ['#8A6A1F', '#C9A24B'], ['#1F5F7A', '#3E8FB0']];

/** Draws a simple portrait-style demo photo (plus its blurred copy) so photos can be tested without real uploads. */
async function makeAvatar(name: string, i: number): Promise<{ url: string; blurredUrl: string } | null> {
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const [c1, c2] = PALETTE[i % PALETTE.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><circle cx="300" cy="330" r="170" fill="rgba(255,255,255,0.14)"/><text x="300" y="410" font-size="230" font-family="Georgia, serif" font-weight="700" fill="#F1E4C3" text-anchor="middle">${name[0]}</text></svg>`;
    const file = `seed-${name.toLowerCase()}.jpg`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(join(UPLOAD_DIR, file));
    await sharp(join(UPLOAD_DIR, file)).resize(600).blur(28).jpeg({ quality: 60 }).toFile(join(UPLOAD_DIR, `blur-${file}`));
    return { url: `/uploads/${file}`, blurredUrl: `/uploads/blur-${file}` };
  } catch {
    console.log(`(could not draw a demo photo for ${name}, continuing without one)`);
    return null;
  }
}

const prisma = new PrismaClient();

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
const some = <T,>(a: T[], n: number): T[] => [...a].sort(() => rand() - 0.5).slice(0, n);

const FEMALE = ['Ayesha', 'Fatima', 'Zainab', 'Maryam', 'Hira', 'Sana', 'Noor', 'Amna', 'Iqra', 'Khadija'];
const MALE = ['Ahmed', 'Bilal', 'Hamza', 'Usman', 'Omar', 'Ali', 'Yusuf', 'Zayd', 'Hassan', 'Ibrahim'];
const PROFESSIONS = ['Software engineer', 'Doctor', 'Teacher', 'Accountant', 'Architect', 'Pharmacist', 'Entrepreneur', 'Lawyer', 'Designer', 'Civil engineer'];
const EDUCATION = ["Bachelor's degree", "Master's degree", 'MBBS', 'PhD', 'Diploma'];
const ETHNICITY = ['Punjabi', 'Pashtun', 'Sindhi', 'Muhajir', 'Baloch', 'Arab', 'Kashmiri'];
const LANGS = ['English', 'Urdu', 'Arabic', 'Punjabi', 'Pashto', 'Sindhi'];
const INTERESTS = ['Travel', 'Reading', 'Cooking', 'Fitness', 'Hiking', 'Photography', 'Volunteering', 'Quran study', 'Cricket', 'Art', 'Coffee', 'Technology'];
const SECTS = ['SUNNI', 'SUNNI', 'SUNNI', 'SHIA', 'JUST_MUSLIM'];
const REL = ['VERY_PRACTISING', 'PRACTISING', 'PRACTISING', 'MODERATE', 'LEARNING'];
const TL = ['ASAP', 'WITHIN_6_MONTHS', 'WITHIN_1_YEAR', 'WITHIN_1_YEAR', 'WITHIN_2_YEARS'];
const BIOS = [
  'Family-oriented, kind and sincere. Looking for someone who values deen and laughter equally.',
  'Love good food, long walks and meaningful conversations. Seeking a respectful life partner.',
  'Believer in simple living, big dreams and strong family ties. Insha\'Allah we find each other.',
];

async function main() {
  const karachi = CITIES.find((c) => c.city === 'Karachi')!;
  let created = 0;

  for (const gender of ['FEMALE', 'MALE'] as const) {
    const names = gender === 'FEMALE' ? FEMALE : MALE;
    for (let i = 0; i < names.length; i++) {
      const email = `seed.${names[i].toLowerCase()}@miora.test`;
      if (await prisma.user.findUnique({ where: { email } })) continue;

      const c = i < 5 ? karachi : pick(CITIES);
      const age = 22 + Math.floor(rand() * 16);
      const dob = new Date(Date.UTC(new Date().getFullYear() - age, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)));
      await prisma.user.create({
        data: {
          email,
          privacy: { create: { blurPhotos: i === 3, allowDirectMessages: i % 2 === 0 } },
          profile: {
            create: {
              firstName: names[i], gender, dateOfBirth: dob, bio: pick(BIOS),
              city: c.city, country: c.country,
              latitude: c.lat + (rand() - 0.5) * 0.15, longitude: c.lng + (rand() - 0.5) * 0.15,
              sect: pick(SECTS) as any, religiousness: pick(REL) as any,
              education: pick(EDUCATION), profession: pick(PROFESSIONS), ethnicity: pick(ETHNICITY),
              languages: some(LANGS, 2 + Math.floor(rand() * 2)), interests: some(INTERESTS, 4 + Math.floor(rand() * 3)),
              marriageTimeline: pick(TL) as any, wantsChildren: rand() > 0.15,
              marriageIntention: 'Looking for a sincere partner to build a halal, loving home.',
              verified: true, onboardingComplete: true,
            },
          },
          icebreakers: { create: [
            { question: 'Tea or coffee?', answer: pick(['Chai, always.', 'Coffee, strong.', 'Both, depending on the day.']), position: 0 },
            { question: 'What are you looking for in a spouse?', answer: 'Kindness, honesty and a good sense of humour.', position: 1 },
            { question: "What's your favourite travel destination?", answer: pick(['Makkah', 'Istanbul', 'Northern Pakistan', 'Malaysia']), position: 2 },
          ] },
        },
      });
      created++;
    }
  }
  console.log(`Created ${created} demo members.`);

  // Every demo member gets a photo, and every second one accepts direct messages (so both cases can be tested).
  for (const names of [FEMALE, MALE]) {
    for (let i = 0; i < names.length; i++) {
      const u = await prisma.user.findUnique({ where: { email: `seed.${names[i].toLowerCase()}@miora.test` } });
      if (!u) continue;
      await prisma.privacySettings.update({ where: { userId: u.id }, data: { allowDirectMessages: i % 2 === 0 } });
      if ((await prisma.media.count({ where: { userId: u.id, type: 'PHOTO' } })) === 0) {
        const a = await makeAvatar(names[i], i);
        if (a) await prisma.media.create({ data: { userId: u.id, type: 'PHOTO', url: a.url, blurredUrl: a.blurredUrl, isPrivate: false, position: 0 } });
      }
    }
  }
  console.log('Demo members have photos; every second one accepts direct messages.');

  // Demo members can log in with the password below, and share their city position on the Globe tab.
  // (Positions expire after 6 hours; run the seed again to refresh them.)
  const passwordHash = await hashPassword('Password123');
  let onGlobe = 0;
  for (const names of [FEMALE, MALE]) {
    for (const n of names) {
      const u = await prisma.user.findUnique({ where: { email: `seed.${n.toLowerCase()}@miora.test` }, include: { profile: true } });
      if (!u?.profile) continue;
      await prisma.user.update({ where: { id: u.id }, data: { passwordHash, name: n } });
      const { latitude, longitude } = u.profile;
      if (latitude != null && longitude != null) {
        await prisma.profile.update({
          where: { userId: u.id },
          data: { gpsLatitude: Math.round(latitude * 1000) / 1000, gpsLongitude: Math.round(longitude * 1000) / 1000, gpsUpdatedAt: new Date() },
        });
        await prisma.privacySettings.update({ where: { userId: u.id }, data: { showOnGlobe: true } });
        onGlobe++;
      }
    }
  }
  console.log(`Demo members log in with seed.<name>@miora.test / Password123 and ${onGlobe} of them are on the Globe.`);

  const gpsLat = parseFloat(process.argv[3]);
  const gpsLng = parseFloat(process.argv[4]);
  if (!Number.isNaN(gpsLat) && !Number.isNaN(gpsLng)) {
    for (const [names] of [[FEMALE], [MALE]] as [string[]][]) {
      for (let i = 0; i < 7; i++) {
        const u = await prisma.user.findUnique({ where: { email: `seed.${names[i].toLowerCase()}@miora.test` } });
        if (!u) continue;
        const km = i === 6 ? 12 : 1 + rand() * 3; // the 7th is deliberately out of range
        const ang = rand() * Math.PI * 2;
        await prisma.profile.update({
          where: { userId: u.id },
          data: {
            gpsLatitude: Math.round((gpsLat + (km / 111) * Math.cos(ang)) * 1000) / 1000,
            gpsLongitude: Math.round((gpsLng + (km / (111 * Math.cos((gpsLat * Math.PI) / 180))) * Math.sin(ang)) * 1000) / 1000,
            gpsUpdatedAt: new Date(),
          },
        });
      }
    }
    console.log(`Placed demo members around ${gpsLat}, ${gpsLng} (6 within 1-4 km, 1 at 12 km, per gender).`);
  }

  const target = process.argv[2];
  if (target) {
    const me = await prisma.user.findUnique({ where: { email: target.toLowerCase() }, include: { profile: true } });
    if (!me?.profile) { console.log(`No finished profile found for ${target}. Complete onboarding in the app first, then re-run.`); return; }
    const pool = me.profile.gender === 'MALE' ? FEMALE : MALE;
    for (const n of pool.slice(0, 6)) {
      const u = await prisma.user.findUnique({ where: { email: `seed.${n.toLowerCase()}@miora.test` } });
      if (!u) continue;
      await prisma.swipe.upsert({
        where: { fromId_toId: { fromId: u.id, toId: me.id } },
        create: { fromId: u.id, toId: me.id, action: 'LIKE' },
        update: { action: 'LIKE' },
      });
    }
    console.log(`6 demo members now like ${target}. Swipe right on them in Discover for instant matches.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
