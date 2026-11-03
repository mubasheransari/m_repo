#!/usr/bin/env node
/**
 * MIORA end-to-end test. Talks to a RUNNING backend over HTTP, exactly like the mobile app does.
 *
 *   node e2e/miora-e2e.mjs                                  # http://localhost:4000
 *   node e2e/miora-e2e.mjs http://192.168.1.23:4000         # another address
 *   node e2e/miora-e2e.mjs http://localhost:4000 --admin you@email.com   # also tests the admin API (that email must be in ADMIN_EMAILS)
 *
 * Needs Node 18+ and the backend running with NODE_ENV=development (the OTP code is returned by the API in development).
 * It creates 6 throw-away members (e2e.*@miora.test) and leaves them in the database; they are harmless.
 */
const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith('http')) || 'http://localhost:4000').replace(/\/$/, '');
const ADMIN = args.includes('--admin') ? args[args.indexOf('--admin') + 1] : null;
const API = BASE + '/api';
const RUN = Date.now().toString(36);
const PROF = `QA Engineer ${RUN}`; // all test members share this, so searches can single them out
const PHOTO = Buffer.from('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', 'base64');

// ------------------------------------------------------------------ tiny test framework
let pass = 0, fail = 0;
const failures = [];
const section = (t) => console.log(`\n=== ${t}`);
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  try {
    const res = await fetch(API + path, { method, headers, body: payload });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (res.status === 429 && !globalThis.__warned429) { globalThis.__warned429 = true; console.log('\n  !! The server answered 429 (too many requests). Start the backend once with DISABLE_THROTTLE=true in .env for testing, then run this again.\n'); }
    return { status: res.status, data };
  } catch (e) { return { status: 0, data: String(e.message || e) }; }
}
const get = (p, t) => call('GET', p, { token: t });
const post = (p, t, b) => call('POST', p, { token: t, body: b });
const put = (p, t, b) => call('PUT', p, { token: t, body: b });
const patch = (p, t, b) => call('PATCH', p, { token: t, body: b });
const del = (p, t) => call('DELETE', p, { token: t });
const q = (o) => '?' + new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]))).toString();
const ageOf = (dob) => { const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); const m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return a; };

async function upload(token, { isPrivate = false, type = 'photos', bytes = PHOTO, filename = 'photo.jpg', mime = 'image/jpeg' } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  if (type === 'photos') form.append('isPrivate', String(isPrivate));
  return call('POST', `/media/${type}`, { token, form });
}
const isUrl = (u) => String(u).startsWith(BASE + '/uploads/'); // the API returns complete, loadable URLs
async function fetchImage(path) {
  try {
    const res = await fetch(path.startsWith('http') ? path : BASE + path);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get('content-type') || '', bytes: buf.length, jpeg: buf[0] === 0xff && buf[1] === 0xd8 };
  } catch (e) { return { status: 0, type: '', bytes: 0, jpeg: false }; }
}

// ------------------------------------------------------------------ the cast
const PEOPLE = {
  ayesha: { gender: 'FEMALE', dob: '1998-03-14', city: 'Karachi', sect: 'SUNNI', religiousness: 'PRACTISING', languages: ['English', 'Urdu'], interests: ['Travel', 'Cooking', 'Reading'], education: "Master's degree", ethnicity: 'Muhajir', marriageTimeline: 'WITHIN_1_YEAR', wantsChildren: true, bio: 'Kind, curious and family-oriented. Love travelling and cooking.' },
  hira:   { gender: 'FEMALE', dob: '1995-08-02', city: 'Karachi', sect: 'SUNNI', religiousness: 'MODERATE',   languages: ['English', 'Urdu', 'Sindhi'], interests: ['Art', 'Coffee'], education: 'MBBS', ethnicity: 'Sindhi', marriageTimeline: 'WITHIN_2_YEARS', wantsChildren: true, bio: 'Doctor who enjoys art and good coffee.' },
  noor:   { gender: 'FEMALE', dob: '1999-11-20', city: 'Lahore',  sect: 'SHIA',  religiousness: 'PRACTISING', languages: ['English', 'Punjabi', 'Arabic'], interests: ['Hiking', 'Photography'], education: "Bachelor's degree", ethnicity: 'Punjabi', marriageTimeline: 'ASAP', wantsChildren: false, bio: 'Photographer and hiker.' },
  omar:   { gender: 'MALE',   dob: '1994-01-25', city: 'Karachi', sect: 'SUNNI', religiousness: 'PRACTISING', languages: ['English', 'Urdu'], interests: ['Travel', 'Cricket', 'Technology'], education: "Master's degree", ethnicity: 'Muhajir', marriageTimeline: 'WITHIN_1_YEAR', wantsChildren: true, bio: 'Software engineer. Cricket, travel and simple living.' },
  bilal:  { gender: 'MALE',   dob: '1996-06-30', city: 'Karachi', sect: 'SUNNI', religiousness: 'MODERATE',   languages: ['English', 'Urdu'], interests: ['Fitness'], education: "Bachelor's degree", ethnicity: 'Punjabi', marriageTimeline: 'WITHIN_1_YEAR', wantsChildren: true, bio: 'Entrepreneur and gym enthusiast.' },
  yusuf:  { gender: 'MALE',   dob: '1993-09-09', city: 'Dubai',   sect: 'JUST_MUSLIM', religiousness: 'LEARNING', languages: ['English', 'Arabic'], interests: ['Technology'], education: 'PhD', ethnicity: 'Arab', marriageTimeline: 'WITHIN_6_MONTHS', wantsChildren: true, bio: 'Researcher based in Dubai.' },
};
const U = {}; // name -> { email, token, refresh, id }
const hasKey = (o, ...keys) => keys.some((k) => JSON.stringify(o).includes(`"${k}"`));
const idsOf = (list) => (Array.isArray(list) ? list.map((c) => c.id) : []);
const disc = async (name, extra = {}) => {
  const r = await get('/discover' + q({ profession: PROF, limit: 50, ...extra }), U[name].token);
  return r.status === 200 ? r.data : [];
};

async function login(email) {
  const r = await post('/auth/otp/request', null, { identifier: email });
  if (r.status !== 200 || !r.data.devCode) return { error: `OTP request failed (${r.status}) ${JSON.stringify(r.data)}. Is the backend running with NODE_ENV=development?` };
  const v = await post('/auth/otp/verify', null, { identifier: email, code: r.data.devCode });
  return v.status === 200 ? { ...v.data } : { error: `verify failed ${v.status} ${JSON.stringify(v.data)}` };
}

// ------------------------------------------------------------------ tests
async function main() {
  console.log(`MIORA end-to-end test against ${BASE}  (run ${RUN})`);
  const health = await get('/geo/cities', 'x');
  if (health.status === 0) { console.log(`\nCannot reach ${BASE}. Start the backend first (npm run start:dev).`); process.exit(2); }

  section('1. Sign-up and sign-in');
  check('invalid email/phone is rejected (400)', (await post('/auth/otp/request', null, { identifier: 'not-an-email' })).status === 400);
  check('private endpoints need a login (401)', (await get('/me')).status === 401);
  for (const n of Object.keys(PEOPLE)) {
    const email = `e2e.${n}.${RUN}@miora.test`;
    const l = await login(email);
    if (l.error) { check(`${n}: sign up with OTP`, false, l.error); continue; }
    U[n] = { email, token: l.accessToken, refresh: l.refreshToken };
    if (n === 'ayesha') check('new member: isNewUser=true and onboarding not complete', l.isNewUser === true && l.onboardingComplete === false);
  }
  check('all 6 members signed up with a one-time code', Object.keys(U).length === 6);
  if (Object.keys(U).length < 6) return;
  const w = await post('/auth/otp/request', null, { identifier: `e2e.wrongcode.${RUN}@miora.test` });
  check('a wrong OTP code is refused (401)', (await post('/auth/otp/verify', null, { identifier: `e2e.wrongcode.${RUN}@miora.test`, code: w.data.devCode === '000000' ? '111111' : '000000' })).status === 401);
  const rf = await post('/auth/refresh', null, { refreshToken: U.ayesha.refresh });
  check('refresh token gives a new access token', rf.status === 200 && !!rf.data.accessToken);

  section('2. Onboarding and profile details');
  const cities = (await get('/geo/cities', U.ayesha.token)).data;
  const cityOf = (name) => cities.find((c) => c.city === name);
  check('city list includes Karachi, Lahore and Dubai with coordinates', ['Karachi', 'Lahore', 'Dubai'].every((c) => cityOf(c)?.lat != null));
  check('under-18 date of birth is rejected (400)', (await put('/me/profile', U.ayesha.token, { firstName: 'Kid', gender: 'FEMALE', dateOfBirth: new Date(Date.now() - 15 * 365 * 864e5).toISOString() })).status === 400);
  check('first save without name/gender/date of birth is rejected (400)', (await put('/me/profile', U.hira.token, { bio: 'x' })).status === 400);
  for (const [n, p] of Object.entries(PEOPLE)) {
    const c = cityOf(p.city);
    const body = { firstName: n[0].toUpperCase() + n.slice(1), gender: p.gender, dateOfBirth: new Date(p.dob + 'T00:00:00Z').toISOString(), city: c.city, country: c.country, latitude: c.lat, longitude: c.lng,
      sect: p.sect, religiousness: p.religiousness, education: p.education, profession: PROF, ethnicity: p.ethnicity, languages: p.languages, interests: p.interests,
      marriageTimeline: p.marriageTimeline, wantsChildren: p.wantsChildren, marriageIntention: 'Looking for a sincere partner.', bio: p.bio };
    const r = await put('/me/profile', U[n].token, body);
    U[n].id = null;
    if (r.status !== 200) { check(`${n}: save profile`, false, `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); continue; }
    U[n].id = r.data.id;
    if (n === 'ayesha') {
      const pr = r.data.profile;
      check('profile saved: all details come back (name, age, city, sect, languages, interests, bio)', pr.firstName === 'Ayesha' && pr.age === ageOf(p.dob) && pr.city === 'Karachi' && pr.sect === 'SUNNI' && pr.languages.length === 2 && pr.interests.length === 3 && pr.bio === p.bio, JSON.stringify(pr).slice(0, 160));
      check('onboarding is marked complete and completeness % is returned', pr.onboardingComplete === true && typeof r.data.completeness === 'number' && r.data.completeness > 40);
    }
  }
  check('all 6 profiles saved', Object.values(U).every((u) => u.id));
  const me = await get('/me', U.omar.token);
  check('GET /me returns the same profile, privacy defaults and no media yet', me.data.profile?.firstName === 'Omar' && me.data.privacy?.allowDirectMessages === false && me.data.privacy?.allowNearbyMessages === true && me.data.media?.length === 0);

  section('3. Profile photos');
  const up = await upload(U.ayesha.token);
  check('photo upload succeeds and the address is a complete URL (http://host/uploads/...)', (up.status === 201 || up.status === 200) && String(up.data.url).startsWith('http') && String(up.data.url).includes('/uploads/'), JSON.stringify(up.data).slice(0, 140));
  check('a blurred copy is created', String(up.data.blurredUrl).includes('/uploads/blur-') && !String(up.data.blurredUrl).includes(String(up.data.url).split('/').pop()));
  const img = await fetchImage(up.data.url);
  check('photo loads over HTTP without login: 200, image/jpeg, same size as uploaded, valid JPEG', img.status === 200 && img.type.includes('image/jpeg') && img.bytes === PHOTO.length && img.jpeg, JSON.stringify(img));
  const blurImg = await fetchImage(up.data.blurredUrl);
  check('blurred copy loads too', blurImg.status === 200 && blurImg.jpeg);
  const priv = await upload(U.ayesha.token, { isPrivate: true });
  check('private photo upload works and is flagged private', (priv.status === 201 || priv.status === 200) && priv.data.isPrivate === true);
  await upload(U.omar.token); await upload(U.hira.token); await upload(U.noor.token); await upload(U.bilal.token);
  const mine = await get('/me', U.ayesha.token);
  check('"My profile" lists both photos with complete URLs', mine.data.media.length === 2 && mine.data.media.every((m) => isUrl(m.url)));
  check('non-image upload is refused (400)', (await upload(U.omar.token, { bytes: Buffer.from('hello'), filename: 'x.txt', mime: 'text/plain' })).status === 400);
  const extra = await upload(U.yusuf.token);
  const rm = await del(`/media/${extra.data.id}`, U.yusuf.token);
  const gone = await fetchImage(extra.data.url);
  check('deleting a photo removes it and its file (file now 404)', rm.status === 200 && gone.status === 404, JSON.stringify(gone));
  check("one member cannot delete another member's photo (403)", (await del(`/media/${up.data.id}`, U.omar.token)).status === 403);
  let last = { status: 0 };
  for (let i = 0; i < 6; i++) last = await upload(U.noor.token);
  check('photo limit: at most 6 photos per member (7th refused with 400)', last.status === 400);

  section('4. Profiles showing to each other, with details and distance');
  const omarSees = await disc('omar');
  const ayeshaSees = await disc('ayesha');
  check('Omar (man) sees the three women and no men', ['ayesha', 'hira', 'noor'].every((n) => idsOf(omarSees).includes(U[n].id)) && omarSees.every((c) => c.gender === 'FEMALE'));
  check('Ayesha (woman) sees the three men and no women', ['omar', 'bilal', 'yusuf'].every((n) => idsOf(ayeshaSees).includes(U[n].id)) && ayeshaSees.every((c) => c.gender === 'MALE'));
  check('they see EACH OTHER (Omar sees Ayesha AND Ayesha sees Omar)', idsOf(omarSees).includes(U.ayesha.id) && idsOf(ayeshaSees).includes(U.omar.id));
  check('nobody sees themselves', !idsOf(omarSees).includes(U.omar.id));
  const ca = omarSees.find((c) => c.id === U.ayesha.id);
  check('card has proper details: name, age, city, country, bio, sect, level of practice, education, profession, ethnicity, languages, interests, timeline', ca && ca.firstName === 'Ayesha' && ca.age === ageOf(PEOPLE.ayesha.dob) && ca.city === 'Karachi' && ca.country === 'Pakistan' && ca.bio === PEOPLE.ayesha.bio && ca.sect === 'SUNNI' && ca.religiousness === 'PRACTISING' && ca.education === "Master's degree" && ca.profession === PROF && ca.ethnicity === 'Muhajir' && ca.languages.includes('Urdu') && ca.interests.includes('Travel') && ca.marriageTimeline === 'WITHIN_1_YEAR', JSON.stringify(ca).slice(0, 200));
  check('card has a compatibility score (0-100) with reasons', typeof ca.compatibility === 'number' && ca.compatibility >= 60 && ca.compatibility <= 100 && ca.reasons.length > 0, `score ${ca?.compatibility} ${JSON.stringify(ca?.reasons)}`);
  check('most compatible first: Ayesha ranks above Noor for Omar', idsOf(omarSees).indexOf(U.ayesha.id) < idsOf(omarSees).indexOf(U.noor.id));
  check('card shows ONLY her public photo (private one is never sent) and it is a complete URL', ca.media.length === 1 && isUrl(ca.media[0].url) && ca.hasPrivatePhotos === true);
  const cardImg = await fetchImage(ca.media[0].url);
  check("Ayesha's photo, as shown on Omar's card, actually loads", cardImg.status === 200 && cardImg.jpeg);
  const leaks = JSON.stringify(omarSees);
  check('no private data leaks in cards (no email, phone, exact coordinates)', !/@miora\.test/.test(leaks) && !hasKey(omarSees, 'latitude', 'longitude', 'gpsLatitude', 'gpsLongitude', 'email', 'phone', 'dateOfBirth'));
  const noorFromOmar = omarSees.find((c) => c.id === U.noor.id);
  check('distance from home cities: Karachi to Lahore is about 1,030 km', noorFromOmar.distanceKm > 1000 && noorFromOmar.distanceKm < 1070, `distanceKm=${noorFromOmar.distanceKm}`);
  const yusufFromAyesha = ayeshaSees.find((c) => c.id === U.yusuf.id);
  check('distance: Karachi to Dubai is about 1,200 km', yusufFromAyesha.distanceKm > 1100 && yusufFromAyesha.distanceKm < 1300, `distanceKm=${yusufFromAyesha.distanceKm}`);
  check('same city (no GPS) reads "In your city", never a fake "1 km"', ca.distanceKm === null && ca.distanceLabel === 'In your city' && ca.distanceSource === 'city', `label=${ca.distanceLabel}`);
  const full = await get(`/profiles/${U.ayesha.id}`, U.omar.token);
  check('opening her full profile shows details, interests and distance', full.status === 200 && full.data.firstName === 'Ayesha' && full.data.interests.length === 3 && full.data.distanceLabel === 'In your city' && full.data.acceptsDirectMessages === false);

  console.log('  -- live GPS (5 km) --');
  check('GPS position accepted (Omar)', (await put('/me/location', U.omar.token, { latitude: 24.8607, longitude: 67.0011 })).status === 200);
  check('GPS position accepted (Ayesha, 3 km north of Omar)', (await put('/me/location', U.ayesha.token, { latitude: 24.8607 + 3 / 111, longitude: 67.0011 })).status === 200);
  check('GPS position accepted (Bilal, 12 km north of Omar)', (await put('/me/location', U.bilal.token, { latitude: 24.8607 + 12 / 111, longitude: 67.0011 })).status === 200);
  const closeOmar = await disc('omar', { mode: 'close' });
  const cc = closeOmar.find((c) => c.id === U.ayesha.id);
  check('"Within 5 km": Omar sees Ayesha at ~3 km measured from GPS', cc && cc.distanceKm === 3 && cc.distanceLabel === '3 km away' && cc.distanceSource === 'gps' && cc.nearbyMessaging === true, `distanceKm=${cc?.distanceKm}`);
  check('"Within 5 km": members without GPS (Hira, Noor) are not listed', !idsOf(closeOmar).includes(U.hira.id) && !idsOf(closeOmar).includes(U.noor.id));
  const closeAyesha = await disc('ayesha', { mode: 'close' });
  check('"Within 5 km": Ayesha sees Omar (3 km) but not Bilal (12 km)', idsOf(closeAyesha).includes(U.omar.id) && !idsOf(closeAyesha).includes(U.bilal.id));
  const ca2 = (await disc('omar')).find((c) => c.id === U.ayesha.id);
  check('normal tabs now use the more accurate GPS distance (3 km, not the 1 km city distance)', ca2.distanceKm === 3, `distanceKm=${ca2.distanceKm}`);
  check('"Within 5 km" without sharing GPS gives a clear error (400)', (await get('/discover?mode=close', U.noor.token)).status === 400);

  console.log('  -- filters --');
  const shia = await disc('omar', { sect: 'SHIA' });
  check('filter sect=SHIA: only Shia members, includes Noor', shia.length > 0 && shia.every((c) => c.sect === 'SHIA') && idsOf(shia).includes(U.noor.id));
  const aa = ageOf(PEOPLE.ayesha.dob), ah = ageOf(PEOPLE.hira.dob);
  const ages = await disc('omar', { minAge: aa - 1, maxAge: aa + 1 });
  check(`filter age ${aa - 1}-${aa + 1}: everyone shown is in range, Ayesha (${aa}) is included, Hira (${ah}) only if in range`, ages.every((c) => c.age >= aa - 1 && c.age <= aa + 1) && idsOf(ages).includes(U.ayesha.id) && idsOf(ages).includes(U.hira.id) === (ah >= aa - 1 && ah <= aa + 1), JSON.stringify(ages.map((c) => c.age)));
  const lang = await disc('omar', { language: 'Sindhi' });
  check('filter language=Sindhi: only Hira', idsOf(lang).includes(U.hira.id) && lang.every((c) => c.languages.includes('Sindhi')));
  const interest = await disc('omar', { interest: 'Photography' });
  check('filter interest=Photography: only Noor', idsOf(interest).includes(U.noor.id) && !idsOf(interest).includes(U.ayesha.id));
  const near = await disc('omar', { mode: 'nearby' });
  check('Nearby tab (50 km): Karachi members yes, Lahore (1,000 km) no', idsOf(near).includes(U.ayesha.id) && idsOf(near).includes(U.hira.id) && !idsOf(near).includes(U.noor.id));
  const ver = await disc('omar', { verifiedOnly: true });
  check('filter verified only: every card is verified', ver.every((c) => c.verified === true));
  check('invalid filter value is rejected (400)', (await get('/discover?sect=PIRATE', U.omar.token)).status === 400);

  console.log('  -- privacy --');
  await patch('/me/privacy', U.hira.token, { hideProfile: true });
  check('Hide profile: Hira disappears from Discover and her profile link gives 404', !idsOf(await disc('omar')).includes(U.hira.id) && (await get(`/profiles/${U.hira.id}`, U.omar.token)).status === 404);
  await patch('/me/privacy', U.hira.token, { hideProfile: false, invisibleMode: true });
  check('Invisible mode also hides her', !idsOf(await disc('omar')).includes(U.hira.id));
  await patch('/me/privacy', U.hira.token, { invisibleMode: false });
  check('turning privacy off brings her back', idsOf(await disc('omar')).includes(U.hira.id));
  await patch('/me/privacy', U.ayesha.token, { showDistance: false });
  check('Show distance OFF: others no longer see her distance', (await disc('omar')).find((c) => c.id === U.ayesha.id).distanceKm === null);
  await patch('/me/privacy', U.ayesha.token, { showDistance: true, blurPhotos: true });
  const blurred = (await disc('omar')).find((c) => c.id === U.ayesha.id);
  const bi = await fetchImage(blurred.media[0].url);
  check('Blur photos ON: others get the blurred copy (flagged) and it loads', blurred.media[0].blurred === true && blurred.photosBlurred === true && blurred.media[0].url.includes('blur-') && bi.status === 200, JSON.stringify(blurred.media));
  await patch('/me/privacy', U.ayesha.token, { blurPhotos: false });
  check('Blur OFF: original photo again', (await disc('omar')).find((c) => c.id === U.ayesha.id).media[0].blurred === false);

  section('5. Likes, passes and matches');
  check('cannot like yourself (400)', (await post('/swipes', U.omar.token, { targetId: U.omar.id, action: 'LIKE' })).status === 400);
  check('cannot like the same gender (400)', (await post('/swipes', U.omar.token, { targetId: U.bilal.id, action: 'LIKE' })).status === 400);
  check('unknown member gives 404', (await post('/swipes', U.omar.token, { targetId: '00000000-0000-4000-8000-000000000000', action: 'LIKE' })).status === 404);
  check('invalid action is rejected (400)', (await post('/swipes', U.omar.token, { targetId: U.ayesha.id, action: 'SUPER' })).status === 400);
  const l1 = await post('/swipes', U.omar.token, { targetId: U.ayesha.id, action: 'LIKE' });
  check('Omar likes Ayesha: not a match yet', l1.status === 201 || l1.status === 200 ? l1.data.matched === false : false, JSON.stringify(l1.data));
  const rec = await get('/likes/received', U.ayesha.token);
  const likeCard = Array.isArray(rec.data) ? rec.data.find((c) => c.id === U.omar.id) : null;
  check('Ayesha sees Omar in "Likes you", with his details', likeCard && likeCard.firstName === 'Omar' && likeCard.age === ageOf(PEOPLE.omar.dob) && likeCard.distanceKm === 3 && likeCard.media.length === 1);
  check('Omar no longer sees Ayesha in Discover (already swiped)', !idsOf(await disc('omar')).includes(U.ayesha.id));
  const p1 = await post('/swipes', U.omar.token, { targetId: U.noor.id, action: 'PASS' });
  check('Omar passes on Noor: no match, and she is hidden from his Discover', p1.data.matched === false && !idsOf(await disc('omar')).includes(U.noor.id));
  check('a pass does not show up as a like for Noor', !((await get('/likes/received', U.noor.token)).data || []).some((c) => c.id === U.omar.id));
  const l2 = await post('/swipes', U.ayesha.token, { targetId: U.omar.id, action: 'LIKE' });
  check("Ayesha likes Omar back: IT'S A MATCH, with his profile and a match id", l2.data.matched === true && !!l2.data.matchId && l2.data.profile?.firstName === 'Omar', JSON.stringify(l2.data).slice(0, 160));
  const mo = await get('/matches', U.omar.token);
  const ma = await get('/matches', U.ayesha.token);
  const mAyesha = mo.data.find((m) => m.profile.id === U.ayesha.id);
  check('both see the match, with details, photo and distance', mAyesha && mAyesha.profile.firstName === 'Ayesha' && mAyesha.profile.distanceKm === 3 && mAyesha.profile.media.length === 1 && ma.data.some((m) => m.profile.id === U.omar.id));
  check('"Likes you" is now empty for Ayesha', !((await get('/likes/received', U.ayesha.token)).data || []).some((c) => c.id === U.omar.id));
  check('a stranger cannot unmatch someone else\'s match (404)', (await del(`/matches/${l2.data.matchId}`, U.noor.token)).status === 404);

  section('6. Messaging, and the "Allow direct messages" setting');
  // Matched members can always talk
  const el0 = await get(`/chat/can-message/${U.ayesha.id}`, U.omar.token);
  check('matched members may message each other (reason MATCH)', el0.data.allowed === true && el0.data.reason === 'MATCH', JSON.stringify(el0.data));
  const m1 = await post('/chat/messages', U.omar.token, { toUserId: U.ayesha.id, body: 'Assalamu alaikum Ayesha' });
  check('a match opens an accepted chat immediately', m1.data.status === 'ACCEPTED', JSON.stringify(m1.data));
  const m2 = await post('/chat/messages', U.ayesha.token, { toUserId: U.omar.id, body: 'Wa alaikum assalam!' });
  const th = await get(`/chat/conversations/${m1.data.conversationId}/messages`, U.omar.token);
  check('both can chat: Omar reads both messages, in order, with fromMe flags', th.data.messages?.length === 2 && th.data.messages[0].fromMe === true && th.data.messages[1].fromMe === false && th.data.messages[1].body === 'Wa alaikum assalam!');
  await post('/chat/messages', U.omar.token, { toUserId: U.ayesha.id, body: 'How are you?' });
  const since = (await get(`/chat/conversations/${m1.data.conversationId}/messages`, U.omar.token)).data.messages;
  const poll = await get(`/chat/conversations/${m1.data.conversationId}/messages${q({ after: since[1].createdAt })}`, U.ayesha.token);
  check('polling with "after" returns only the newer message', poll.data.messages.length === 1 && poll.data.messages[0].body === 'How are you?');

  // The recipient decides: Hira has direct messages OFF
  console.log('  -- recipient has "Allow direct messages" OFF --');
  const off = await get(`/chat/can-message/${U.hira.id}`, U.omar.token);
  check('not matched, not within 5 km, setting OFF: messaging is NOT allowed', off.data.allowed === false && off.data.reason === 'NOT_ALLOWED', JSON.stringify(off.data));
  const offSend = await post('/chat/messages', U.omar.token, { toUserId: U.hira.id, body: 'Salam' });
  check('sending anyway is refused (403) with a clear reason', offSend.status === 403 && /matched|5 km/.test(JSON.stringify(offSend.data)), JSON.stringify(offSend.data));
  check('her public profile says she does NOT accept direct messages', (await get(`/profiles/${U.hira.id}`, U.omar.token)).data.acceptsDirectMessages === false);

  console.log('  -- recipient turns "Allow direct messages" ON --');
  check('Hira switches the setting ON', (await patch('/me/privacy', U.hira.token, { allowDirectMessages: true })).data.allowDirectMessages === true);
  check('her profile now shows "open to messages" and Omar may message her (reason DIRECT)', (await get(`/profiles/${U.hira.id}`, U.omar.token)).data.acceptsDirectMessages === true && (await get(`/chat/can-message/${U.hira.id}`, U.omar.token)).data.reason === 'DIRECT');
  const d1 = await post('/chat/messages', U.omar.token, { toUserId: U.hira.id, body: 'Assalamu alaikum Hira, may I introduce myself?' });
  check('Omar sends a direct message: it becomes a PENDING request', d1.data.status === 'PENDING', JSON.stringify(d1.data));
  check('he cannot send a second message until she accepts (403)', (await post('/chat/messages', U.omar.token, { toUserId: U.hira.id, body: 'Hello?' })).status === 403);
  const hiraList = (await get('/chat/conversations', U.hira.token)).data;
  const req = hiraList.find((c) => c.id === d1.data.conversationId);
  check('Hira sees the request with his details, the message text and 1 unread', req && req.status === 'PENDING' && req.isInitiator === false && req.other.firstName === 'Omar' && req.lastMessage.body.startsWith('Assalamu alaikum Hira') && req.unread === 1, JSON.stringify(req).slice(0, 200));
  check('her unread summary counts 1 request', (await get('/chat/unread', U.hira.token)).data.requests === 1);
  check('Omar sees it as a sent request (he started it)', (await get('/chat/conversations', U.omar.token)).data.find((c) => c.id === d1.data.conversationId)?.isInitiator === true);
  check('Omar cannot accept his own request (403)', (await post(`/chat/conversations/${d1.data.conversationId}/respond`, U.omar.token, { action: 'ACCEPT' })).status === 403);
  check('an outsider cannot read the conversation (404)', (await get(`/chat/conversations/${d1.data.conversationId}/messages`, U.noor.token)).status === 404);
  const read = await get(`/chat/conversations/${d1.data.conversationId}/messages`, U.hira.token);
  check('Hira opens it and reads the message', read.data.messages.length === 1 && read.data.conversation.other.firstName === 'Omar');
  check('after reading, her unread count drops to 0', (await get('/chat/conversations', U.hira.token)).data.find((c) => c.id === d1.data.conversationId).unread === 0);
  check('Hira accepts', (await post(`/chat/conversations/${d1.data.conversationId}/respond`, U.hira.token, { action: 'ACCEPT' })).data.status === 'ACCEPTED');
  const d2 = await post('/chat/messages', U.omar.token, { toUserId: U.hira.id, body: 'Thank you for accepting.' });
  const d3 = await post('/chat/messages', U.hira.token, { toUserId: U.omar.id, body: 'Pleasure. Tell me about yourself.' });
  check('after accepting, both can chat freely', d2.data.status === 'ACCEPTED' && d3.data.status === 'ACCEPTED');
  await patch('/me/privacy', U.hira.token, { allowDirectMessages: false });
  const d4 = await post('/chat/messages', U.omar.token, { toUserId: U.hira.id, body: 'Still here :)' });
  check('switching the setting OFF later does not break an accepted chat', d4.status === 201 || d4.status === 200 ? d4.data.status === 'ACCEPTED' : false);

  console.log('  -- anyone may message when the setting is ON; both ON = either can start --');
  check('Noor (setting OFF): Yusuf, a stranger far away, cannot message her', (await get(`/chat/can-message/${U.noor.id}`, U.yusuf.token)).data.allowed === false);
  await patch('/me/privacy', U.noor.token, { allowDirectMessages: true });
  check('Noor turns it ON: now Yusuf (Dubai) and Omar and Bilal can all message her', (await get(`/chat/can-message/${U.noor.id}`, U.yusuf.token)).data.allowed === true && (await get(`/chat/can-message/${U.noor.id}`, U.omar.token)).data.allowed === true && (await get(`/chat/can-message/${U.noor.id}`, U.bilal.token)).data.allowed === true);
  await patch('/me/privacy', U.yusuf.token, { allowDirectMessages: true });
  check('both ON: Noor can start a conversation with Yusuf too', (await get(`/chat/can-message/${U.yusuf.id}`, U.noor.token)).data.allowed === true);
  const y1 = await post('/chat/messages', U.yusuf.token, { toUserId: U.noor.id, body: 'Salam Noor, I like your photography.' });
  check('Yusuf sends Noor a request', y1.data.status === 'PENDING');
  check('Noor declines', (await post(`/chat/conversations/${y1.data.conversationId}/respond`, U.noor.token, { action: 'DECLINE' })).data.status === 'DECLINED');
  check('Yusuf cannot ask again after a decline (403)', (await post('/chat/messages', U.yusuf.token, { toUserId: U.noor.id, body: 'Please?' })).status === 403);
  const b1 = await post('/chat/messages', U.bilal.token, { toUserId: U.noor.id, body: 'Salam Noor.' });
  check('Bilal sends a request; Noor BLOCKS him', b1.data.status === 'PENDING' && (await post(`/chat/conversations/${b1.data.conversationId}/respond`, U.noor.token, { action: 'BLOCK' })).data.blocked === true);
  check('after the block they cannot message each other and no longer see each other', (await get(`/chat/can-message/${U.noor.id}`, U.bilal.token)).data.allowed === false && !idsOf(await disc('bilal')).includes(U.noor.id) && !idsOf(await disc('noor')).includes(U.bilal.id));
  check('blocked chat is closed (404 for the blocked person)', (await get(`/chat/conversations/${b1.data.conversationId}/messages`, U.bilal.token)).status === 404);
  await del(`/blocks/${U.bilal.id}`, U.noor.token);
  const b2 = await post('/chat/messages', U.bilal.token, { toUserId: U.noor.id, body: 'Salam again, sorry for earlier.' });
  check('after unblocking, a fresh request is possible (old messages cleared)', b2.data.status === 'PENDING' && (await get(`/chat/conversations/${b2.data.conversationId}/messages`, U.noor.token)).data.messages.length === 1);

  console.log('  -- within 5 km (GPS), no setting needed --');
  const n1 = await get(`/chat/can-message/${U.ayesha.id}`, U.bilal.token);
  check('Bilal is 9 km from Ayesha: not allowed', n1.data.allowed === false);
  check('Bilal moves to 2 km from Ayesha', (await put('/me/location', U.bilal.token, { latitude: 24.8607 + 3 / 111 + 2 / 111, longitude: 67.0011 })).status === 200);
  const n2 = await get(`/chat/can-message/${U.ayesha.id}`, U.bilal.token);
  check('within 5 km: Bilal may message Ayesha even though she has direct messages OFF (reason NEARBY)', n2.data.allowed === true && n2.data.reason === 'NEARBY', JSON.stringify(n2.data));
  await patch('/me/privacy', U.ayesha.token, { allowNearbyMessages: false });
  check('Ayesha switches "Allow nearby messages" OFF: Bilal is blocked again', (await get(`/chat/can-message/${U.ayesha.id}`, U.bilal.token)).data.allowed === false);
  await patch('/me/privacy', U.ayesha.token, { allowNearbyMessages: true, hideProfile: true });
  check('a hidden profile cannot be messaged at all', (await get(`/chat/can-message/${U.ayesha.id}`, U.bilal.token)).data.reason === 'UNAVAILABLE');
  await patch('/me/privacy', U.ayesha.token, { hideProfile: false });

  console.log('  -- input safety --');
  check('empty message is rejected (400)', (await post('/chat/messages', U.omar.token, { toUserId: U.ayesha.id, body: '' })).status === 400);
  check('message over 1,000 characters is rejected (400)', (await post('/chat/messages', U.omar.token, { toUserId: U.ayesha.id, body: 'x'.repeat(1001) })).status === 400);
  check('same-gender messaging is refused (403)', (await post('/chat/messages', U.omar.token, { toUserId: U.bilal.id, body: 'hi' })).status === 403);
  check('unlimited-free-text injection is just text (a <script> message is stored as text)', (await post('/chat/messages', U.omar.token, { toUserId: U.ayesha.id, body: '<script>alert(1)</script>' })).data.message?.body === '<script>alert(1)</script>');

  section('7. Unmatch and block');
  const un = await del(`/matches/${l2.data.matchId}`, U.omar.token);
  check('Omar unmatches: the match disappears for both of them', un.status === 200 && !(await get('/matches', U.omar.token)).data.some((m) => m.profile.id === U.ayesha.id) && !(await get('/matches', U.ayesha.token)).data.some((m) => m.profile.id === U.omar.id));
  const blk = await post(`/blocks/${U.ayesha.id}`, U.omar.token);
  check('Omar blocks Ayesha: their chat is closed for both', blk.status < 300 && (await get(`/chat/conversations/${m1.data.conversationId}/messages`, U.ayesha.token)).status === 404 && (await get(`/chat/conversations/${m1.data.conversationId}/messages`, U.omar.token)).status === 404);
  check('they disappear from each other in Discover and profile links', !idsOf(await disc('omar')).includes(U.ayesha.id) && !idsOf(await disc('ayesha')).includes(U.omar.id) && (await get(`/profiles/${U.omar.id}`, U.ayesha.token)).status === 404);
  check('blocked list shows her', (await get('/blocks', U.omar.token)).data.some((b) => b.userId === U.ayesha.id));
  await del(`/blocks/${U.ayesha.id}`, U.omar.token);

  if (ADMIN) {
    section('8. Admin');
    const a = await login(ADMIN);
    if (a.error) check('admin sign-in', false, a.error);
    else {
      const at = a.accessToken;
      const st = await get('/admin/stats', at);
      check('admin stats: totals include the members, likes, conversations and messages created above', st.status === 200 && st.data.total >= 6 && st.data.onboarded >= 6 && st.data.likes >= 2 && st.data.messages >= 5 && st.data.conversations >= 2, JSON.stringify(st.data));
      check('a normal member cannot use the admin API (403)', (await get('/admin/stats', U.omar.token)).status === 403);
      const us = await get(`/admin/users${q({ search: 'e2e.ayesha.' + RUN })}`, at);
      const au = us.data.items?.[0];
      check('admin members list shows her profile and photo', au && au.profile.firstName === 'Ayesha' && isUrl(au.media?.[0]?.url), JSON.stringify(au).slice(0, 200));
      check('admin verify: her card now shows the verified badge', (await patch(`/admin/users/${U.ayesha.id}/verify`, at, { verified: true })).status === 200 && (await get(`/profiles/${U.ayesha.id}`, U.bilal.token)).data.verified === true);
      check('admin suspends Omar: his login stops working (401)', (await patch(`/admin/users/${U.omar.id}/status`, at, { status: 'SUSPENDED' })).status === 200 && (await get('/me', U.omar.token)).status === 401);
      check('suspended members disappear from Discover', !idsOf(await disc('ayesha')).includes(U.omar.id));
      check('admin re-activates him: access returns', (await patch(`/admin/users/${U.omar.id}/status`, at, { status: 'ACTIVE' })).status === 200 && (await get('/me', U.omar.token)).status === 200);
    }
  }

  if (process.env.E2E_DB) {
    section('9. Old photo addresses (database-level)');
    const { default: pg } = await import('pg');
    const db = new pg.Client({ connectionString: process.env.E2E_DB }); await db.connect();
    await db.query(`UPDATE "Media" SET url = 'http://localhost:4000' || url WHERE "userId" = $1 AND "isPrivate" = false AND url LIKE '/uploads/%'`, [U.hira.id]);
    const old = (await db.query(`SELECT url FROM "Media" WHERE "userId" = $1 LIMIT 1`, [U.hira.id])).rows[0].url;
    await patch('/me/privacy', U.hira.token, { allowDirectMessages: true });
    const view = (await get(`/profiles/${U.hira.id}`, U.bilal.token)).data;
    const own = (await get('/me', U.hira.token)).data;
    const f2 = await fetchImage(view.media[0].url);
    check(`a photo saved the OLD way (${old.slice(0, 32)}...) is now served with the current server address and still loads`, old.startsWith('http://localhost') && isUrl(view.media[0].url) && isUrl(own.media[0].url) && f2.status === 200);
    await db.end();
  }

  console.log(`\n==================== ${pass} passed, ${fail} failed ====================`);
  if (fail) console.log('Failed checks:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
