# UniFind

UniFind is a lost and found website for one university campus. It is a CS 413 final project. Students, faculty and staff post what they lost or found, search the open reports, and get a push alert when someone posts a report that looks like theirs.

The main feature is F-01. A signed-in user reports a lost or found item with a category, a description and an optional photo. UniFind saves the report, compares it with open reports of the opposite type, and alerts the people who posted likely matches. The reporter sees the report ID and how many matches were found.

## How the code is organized

The design follows LA2: a client and a server, with the server built as one Express app split into layers.

```
frontend/   static Bootstrap site, talks to the API over HTTPS with JSON
            also talks directly to Firebase Auth (sign-in), Cloudinary (photo upload)
            and the OneSignal web SDK (push opt-in)

backend/    Express API
  middleware/auth.js                 checks the Firebase ID token on every /api/items call
  controllers/itemController.js      I-1, validates the request
  services/itemService.js            I-2 createItem
  services/matchingService.js        I-3 findMatches, no I/O
  repositories/                      Firestore, or in-memory for demo mode
  adapters/notificationAdapter.js    I-4, calls OneSignal

shared/categories.json   the categories and matching settings, read by both sides
firebase/                Firestore rules (browsers get no direct access) and indexes
```

| Contract | File | What it does |
|---|---|---|
| I-1 `POST /api/items` | `itemController.js` | Needs a Firebase ID token. Returns 201 with `{itemId, matchCount, notificationStatus}`, 400 with every invalid field, 401, or 503 |
| I-2 `createItem(report, uid)` | `itemService.js` | Saves the report, finds matches and sends alerts. A failed alert never fails the request |
| I-3 `findMatches(newItem, candidates)` | `matchingService.js` | Looks only at open reports of the opposite type in the same category. Returns up to 3 `{itemId, score}`, best first |
| I-4 `sendMatchAlert(ownerUid, message, itemId)` | `notificationAdapter.js` | Sends to the OneSignal external ID with a 5 second timeout. Returns `sent` or `failed` and never throws |
| I-5 browser to Cloudinary | `frontend/js/services.js` | Uploads through an unsigned preset (JPG, PNG or WebP, 5 MB max). If the upload fails, the user can still post |

Matching works on the words in the title and description. The matcher lowercases them and drops common words and generic ones like "bag", "lost" and "item". Plurals become singular, and each category has a short synonym list, so "phone" and "cellphone" count as the same word. Every shared word adds 1 to the score and a shared color adds 0.5. A report needs a score of 1.5 to count as a match, or 2.5 in "Others". You can change these numbers in `shared/categories.json`.

Alerts for all matches go out at the same time. If OneSignal is down, a post waits for one 5 second timeout instead of 5 seconds per match. When any alert fails, the report is still saved and its `notificationStatus` becomes `pending_retry`. Nothing retries those alerts yet.

## Running it locally

You need Node.js 22 or newer. The version is in `.nvmrc` and in `engines` in `backend/package.json`.

```bash
git clone https://github.com/Kineticsss/UniFind.git
cd UniFind/backend
npm ci
cp ../.env.example .env      # the defaults run demo mode
npm start                    # open http://localhost:8080
```

Demo mode doesn't need any accounts. You sign in with any name, reports are kept in memory until the server stops, and alerts are printed in the terminal instead of being sent. Photo upload stays off until Cloudinary is set up.

To run the tests:

```bash
npm test
```

## Connecting the real services

Put these values in `backend/.env` when running locally, or in the Vercel project's Environment Variables when deployed. Don't commit keys or the service account file. `.gitignore` already blocks `.env` and service account JSON files.

1. Firebase (LA3 C-03 and C-04)
   - Create a Firebase project. In Authentication, turn on Email/Password and Google, and add `localhost` and your Vercel site's domain to the authorized domains (Authentication, Settings tab). Projects made after April 2025 don't include `localhost` by default.
   - Create a Firestore database. Deploy the rules and indexes in `firebase/` with `npx firebase-tools deploy --only firestore`, or paste them into the console.
   - In Project settings, open Service accounts and generate a new private key. Copy `project_id`, `client_email` and `private_key` from that file into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.
   - In Project settings under General, add a Web app. Its `apiKey`, `authDomain`, `projectId` and `appId` go into the frontend config (step 4).
   - Set `AUTH_MODE=firebase` and `STORAGE_MODE=firestore`.
2. Cloudinary (C-05). In Settings, open Upload, then the Upload Presets tab, and add a preset with the signing mode set to Unsigned. Set its allowed formats to `jpg,png,webp`. Cloudinary presets can't hold a file size limit, so the 5 MB cap is checked in the browser before upload (`frontend/js/services.js`). The backend needs `CLOUDINARY_CLOUD_NAME`. The preset name goes in the frontend config.
3. OneSignal (C-06). Create a Web app (Typical Site) with your HTTPS site URL. Create the REST API key under Settings, Keys & IDs, Add Key, and copy it right away because it is shown only once. The service worker it needs, `frontend/OneSignalSDKWorker.js`, is already at the site root. Set `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` and `NOTIFY_MODE=onesignal`. Users turn alerts on from the Your reports page.
4. Frontend config. `frontend/js/config.js` holds values the browser needs. None of them are secret. For a local run against the real services, edit the file: set `authMode: 'firebase'` and fill in the Firebase web config, the Cloudinary cloud name and preset, and the OneSignal app ID. On Vercel, `frontend/scripts/build-config.js` writes this file from environment variables during the build.

If you pick a real service but leave out one of its variables, the backend stops at startup and names the missing variable (C-02).

## Deploying on Vercel

`vercel.json` deploys the site and the API as one Vercel project on the free Hobby plan. The site is served from `frontend/`, and every `/api/*` request goes to `api/index.js`, which runs the Express app from `backend/` as a serverless function. Because both share one domain, `API_BASE_URL` stays empty, and `CORS_ORIGINS` and `FRONTEND_URL` default to the project's production URL.

1. On vercel.com, sign up with GitHub, choose Add New, then Project, and import this repo. Leave Framework Preset as Other and the root directory as `./`. The build settings come from `vercel.json`.
2. Before clicking Deploy, open Environment Variables and add:
   - `NODE_ENV=production`, `AUTH_MODE=firebase`, `STORAGE_MODE=firestore`, `NOTIFY_MODE=fake` (change to `onesignal` once OneSignal is set up)
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (paste the key exactly as it appears in the service account file, with the `\n` sequences and without the outer quotes)
   - `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`
   - Later: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`
3. Deploy. Then add the site's domain (for example `unifind.vercel.app`) to Firebase's authorized domains, and use `https://<that domain>` as the OneSignal site URL.
4. After changing an environment variable, redeploy from the Deployments tab so the new value is used.

`https://<domain>/api/health` should return `{"ok":true}`. Vercel functions don't sleep the way Render's free API did, so there is no one-minute wake-up delay.

## API

Every `/api/items` route needs an `Authorization: Bearer <Firebase ID token>` header.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Returns `{ ok: true }` |
| GET | `/api/categories` | The 8 categories |
| POST | `/api/items` | Body fields: `type` (lost or found), `title` (3 to 100 characters), `category` (a slug), `description` (up to 500 characters), `location` (optional, up to 100 characters), `date` (YYYY-MM-DD, not later than today in Philippine time), `imageUrl` (optional, must start with `https://res.cloudinary.com/<your cloud>/image/upload/`) |
| GET | `/api/items?type=&category=&q=&from=&to=` | Open reports, newest first |
| GET | `/api/items/mine` | The signed-in user's reports, each with its possible matches |
| GET | `/api/items/:id` | One report |

Errors look like `{ "error": { "code", "message", "fields" } }`, where `fields` only appears on validation errors. The codes are `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `NOT_FOUND` (404) and `STORAGE_UNAVAILABLE` (503).

The category slugs are `ids_documents`, `wallets`, `gadgets`, `bags`, `keys`, `school_supplies`, `clothing_accessories` and `others`.

## Data model

Reports live in the Firestore collection `items`, one document each.

| Field | Type | Notes |
|---|---|---|
| `type` | `lost` or `found` | |
| `title`, `description`, `location` | string | |
| `category` | string | A category slug |
| `date` | string | YYYY-MM-DD, the day the item was lost or found |
| `imageUrl` | string or null | Cloudinary URL |
| `ownerUid` | string | Firebase UID. The API never sends it to browsers |
| `status` | `open` | `resolved` is reserved for later |
| `matches` | list of `{itemId, score}` | Saved on both reports of a match |
| `notificationStatus` | `none`, `sent` or `pending_retry` | |
| `createdAt` | string | ISO timestamp |

## Tests

Run `npm test` in `backend/`. It uses Node's built-in test runner, and the test names follow LA3 Worksheet B.

| Test | What it checks |
|---|---|
| ST-01 | A lost wallet matches an open found wallet. The finder gets an alert and both users see the match |
| ST-02 | A 2-character title, an unknown category, a 600-character description and a future date return 400 with all four fields listed |
| ST-03 | A request with no token or a bad token returns 401 and saves nothing |
| ST-04 | A database failure returns 503 |
| ST-05 | With OneSignal failing on 3 matches, the post still returns 201 with `pending_retry`, and the three alerts run at the same time |
| ST-06 | Synonyms match, the same words in different categories don't, and generic words stay below the threshold |
| ST-07 | A report without a photo is accepted. Rejecting a bad upload happens in the browser and has to be checked by hand |
| ST-08 | An `imageUrl` from another site or another Cloudinary account returns 400 |
| I-3, I-4, C-02 | Matching rules, OneSignal failures and timeouts, and missing environment variables |

These tests use stand-ins for Firebase, Cloudinary and OneSignal. The checks in Worksheets A and C still need a manual run once the real accounts exist.

## Privacy (Data Privacy Act of 2012)

The API never returns another user's UID or email. A report shows only what its reporter typed, and the form asks people to leave ID numbers and other private details out of descriptions. Browsers can't read or write Firestore directly because `firebase/firestore.rules` denies all client access. Keys are kept in environment variables only.

UniFind doesn't handle delivery, payment, the physical handover, legal proof of ownership, other campuses, or native mobile apps.
