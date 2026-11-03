# Update: compatibility quizzes and colour themes

## Run these after copying the files in
```bash
npx prisma generate
npx prisma db push          # adds the quiz tables, User.themeKey and Message.kind
npm run start:dev
```
No new packages. Keep your own `.env`.

## Compatibility quizzes
Three ready-made quizzes (10 questions each, about 4 minutes): **Marriage & Values**, **Compatibility & Lifestyle**,
**Future Life & Goals**. The questions live in `src/quiz/quiz.catalog.ts`.

How it works:
1. Member A answers a quiz and sends it to member B (inside their chat).
2. B takes the quiz. A's answers stay hidden from B until B has finished.
3. The server scores how closely the two sets of answers agree. **Both** members then see the same score,
   a score per topic, and every question side by side (what you answered, what they answered).
4. Only the two members can read any of it (everyone else gets 404). A block hides it.

Scoring: a weighted average over the questions. Scale questions give partial credit for close answers, choice questions
need the same answer, and "I am flexible" answers fit anything at 75%. `important` questions are flagged when answers differ.

Who can send: members you have **matched with**, or whose chat has been **accepted**. Never strangers.
Limits: one open quiz of each kind per pair, 10 invitations per member per day, an invitation expires after 7 days.

Quiz events appear in the chat as messages (`kind` = QUIZ_SENT / QUIZ_DONE / QUIZ_DECLINED / QUIZ_CANCELLED with a small
`quiz` card), so unread badges and notifications already work.

| Endpoint | |
|---|---|
| `GET /api/quizzes`, `GET /api/quizzes/:quizId` | catalogue / the questions |
| `POST /api/quiz-invites` `{toUserId, quizId, answers}` | answer first, then send |
| `GET /api/quiz-invites[?withUserId=]`, `GET /api/quiz-invites/:id` | my quizzes / one quiz (questions to answer, or the result) |
| `POST /api/quiz-invites/:id/answer` `{answers}` | the recipient answers: the score is worked out |
| `POST /api/quiz-invites/:id/decline`, `.../cancel` | recipient says no / sender takes it back |

Changing a quiz: edit wording freely. If you change the questions or options of a quiz people may already have answered,
add a new `version` and keep the old definition, otherwise old results will no longer read correctly.

Try it with one phone: `npx tsx prisma/quiz-demo.ts you@example.com` makes a demo member send you a quiz.

## Colour themes
- `PUT /api/me/theme` `{themeKey}` saves the member's theme for the whole app (`GET /api/me` returns `themeKey`).
- `PUT /api/chat/conversations/:id/theme` `{themeKey}` saves a theme for **one chat**. It is personal: the other person
  keeps their own. `GET .../messages` returns `conversation.myThemeKey`.
- A `themeKey` is a preset (`rose`, `ocean`, `emerald`, `violet`, `sunset`, `teal`, `crimson`, `mocha`), a custom `#RRGGBB`,
  or `null` (default / app theme).

# Update: password login, Globe, admin panel

## Run these after unzipping
```bash
npm install
npx prisma generate
npx prisma db push        # adds User.name, User.passwordHash, PrivacySettings.showOnGlobe
npm run seed              # optional: demo members (password Password123), some on the Globe
npm run start:dev
```
Add to `.env` (see `.env.example`):
```
ADMIN_EMAIL=admin@miora.test
ADMIN_PASSWORD=ChangeMe12345     # at least 8 characters
```

## Email + password sign up / log in
- `POST /api/auth/register` `{name, email, password, confirmPassword}` creates the account and returns tokens (signed in straight away).
- `POST /api/auth/login` `{email, password}` returns tokens and `role`.
- Password: 8-72 characters, at least one letter and one number. Hashed with scrypt (built in, no new package).
- Wrong email and wrong password give the same message. The OTP endpoints still exist but the app no longer uses them.
- Accounts made earlier with a one-time code have no password: sign up again with another email (or delete your test users).
- Emails are NOT verified yet (no email service connected), so anyone can register any address.

## Globe
- `PUT /api/me/globe` `{enabled, latitude?, longitude?}` is the "Show my location" switch.
- `GET /api/globe` lists members who share. Answers `403 GLOBE_OFF` unless the caller shares too.
- Others only get a position rounded to 0.01 degrees (about 1 km), never the stored one. Only opposite-gender, verified, visible members who share a fresh position (under 6 h) are listed.
- Turning it off removes your stored position when "Allow nearby messages" is off too.

## Admin panel
- Open `http://localhost:4000/admin-panel/` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Dashboard, Users (search, suspend/ban/activate, verify, details), Photo verifications (view selfie, approve, reject with reason).
- New API: `GET /api/admin/users/:id`; `stats` now has `onGlobe` and `pendingVerifications`.

# Backend fixes

## Profile images
- Root cause: the API returned image paths ("/uploads/x.jpg"); the app passes them straight to Image.network, which needs a full URL.
  A global interceptor (`common/media-url.*`) now turns every `url` / `blurredUrl` into a complete URL using the address the client called
  (10.0.2.2 on the emulator, LAN IP on a phone, your domain in production). Old rows saved as "http://localhost:4000/uploads/..." are repaired on the way out.
- One upload folder (`media/upload-dir.ts`) is now used by the uploader, the media service and the static server (they could disagree before).
- Files get a correct extension from their MIME type; non-images are rejected; photo `position` no longer collides after a delete; static files send cache + CORP headers.

## Blur
- Blurred copy used a guessable name ("blur-<original>.jpg") -> the sharp original could be derived. It now has a random name.
- Photos with a missing/deleted/guessable blurred copy are regenerated at start-up and whenever blur is switched on (they used to vanish from other members' view).
- API: `photosBlurred` added to every profile card; `media[].blurred` kept. Private photos and originals are never sent while blur is on.

## Nearby / Within 5 km
- Root cause for Nearby: the app sends only a typed city, so profiles had no coordinates and were invisible to distance search. Coordinates are now resolved
  from the city list on save (`geo/cities.ts#findCity`), and existing profiles are backfilled at start-up (`geo/geo-backfill.service.ts`).
- Discover: distance filter without a location now returns a clear 400 instead of silently returning everyone; min age > max age is rejected;
  GPS is used as fallback origin for members without a city. Latitude/longitude must be sent as a pair.
- Within 5 km logic (GPS, 6 h freshness, haversine, same rule as messaging eligibility) was correct and is unchanged.

## Files changed
src/common/media-url.ts, media-url.interceptor.ts (new) · src/media/* · src/geo/* · src/profile/{profile.service,profile.module,public-view}.ts ·
src/matching/matching.service.ts · src/app.module.ts · src/main.ts · e2e/miora-e2e.mjs · README.md · .env.example
No database/schema change.

---------------------------------------------------------------------------------------------------------------

# Round 2

## Distance ("1 km" on two phones)
- Cause 1: when either phone had not shared GPS, distance fell back to the city centre (0 km for two people in one city) and then `Math.max(1, round(km))` turned that into "1 km".
- Cause 2: anything under 1.5 km was always shown as "1 km".
- Now every profile card has `distanceKm` (0.1 km precision under 10 km), `distanceLabel` ("0.4 km away", "In your city", "About 430 km away") and `distanceSource` ('gps' | 'travel' | 'city').
  A city-based distance is never presented as an exact number. The app keeps GPS fresh so real distances are used.

## Login / sign up (`src/auth`)
- New explicit endpoints: `POST /auth/signup/request|verify` and `POST /auth/login/request|verify`.
  Sign up with an existing account -> 409 "already exists, log in". Log in with no account -> 404 "no account, sign up". A wrong choice never burns the code.
- Phone numbers are cleaned ("+92 300-1234567"), emails lower-cased, the code must be 6 digits; wrong code says how many attempts are left;
  resend cooldown is reported (`resendAfterSeconds`, `retryAfterSeconds` on 429). Old `/auth/otp/*` endpoints still work.

## Notifications feed (`src/notifications`)
- `GET /notifications?since=<serverTime>` returns new `likes`, `matches` and `messages` (with sender name + the photo they are allowed to show; blur/private rules apply),
  skipping blocked members, mutual likes (reported as matches) and declined/closed conversations. No schema change.

## Performance
- Uploaded photos are re-encoded (max 1440 px, JPEG) instead of being stored as 5-12 MB originals; blurred copies are smaller.

---------------------------------------------------------------------------------------------------------------

# Round 3: mandatory photo verification

Members must prove their photos are of themselves before they can use MIORA.

1. Photos: the member uploads photos as before.
2. `POST /verification/challenge` gives a random gesture (smile / open mouth / turn head), signed and valid for 10 minutes, single use.
3. `POST /verification/selfie` (multipart `file` + `challenge`): the live selfie is checked (one face, good light, the gesture) and compared with EVERY photo on the profile.
   `GET /verification` returns the status: NOT_STARTED | PENDING | APPROVED | REJECTED (+ reason). `/me` includes the same under `verification`.

Engines (`VERIFICATION_ENGINE`):
- `rekognition`: automatic, with AWS Rekognition (set `AWS_REGION` + AWS credentials; `FACE_MATCH_THRESHOLD`, default 90).
- `manual`: the selfie waits in an admin queue: `GET /admin/verifications`, `GET /admin/verifications/:id/selfie`, `POST /admin/verifications/:id/approve|reject`.
- `dev`: approves everything (development only; refused when NODE_ENV=production).
Not set: rekognition if AWS credentials exist, otherwise manual.

Enforcement (server side, cannot be skipped from the app):
- Until verified, every feature endpoint (discover, swipes, likes, matches, chat, notifications, other members' profiles) answers `403 {code: "VERIFICATION_REQUIRED"}`.
  Still allowed: sign up/login, profile, photos, GPS, verification. Admins are exempt.
- Unverified members are invisible to everyone else (discovery, profile view, messaging).
- Photos added AFTER verification must show the same person: automatic engines check them against the approved selfie and refuse other people's photos;
  with manual review the member verifies again. A member cannot set `verified` themselves.
- Selfies are stored in a PRIVATE folder (`PRIVATE_DIR`, default `private/`), never served publicly, only to admins.

Database: new table `PhotoVerification` (migration `20261031000000_photo_verification`). Run `npx prisma migrate deploy` (or `npx prisma db push`).
Existing members start unverified and must verify. To test with the old e2e script run the server with `REQUIRE_PHOTO_VERIFICATION=false`.
Seed members are created verified.
