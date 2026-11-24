# UniFind

A campus lost and found web app (CS 413 final project). Students, faculty and staff post lost or found items, search the board, and get a push alert when a new report likely matches theirs.

Feature **F-01**: a signed-in user reports a lost or found item (category, description, optional photo). The system saves it, matches it against open reports of the opposite type, and alerts the owners of likely matches. The reporter sees the report ID and match count.

## How it is built

Layered client-server, backend as a modular monolith (LA2).

```
frontend/  static Bootstrap site  ──HTTPS/JSON──▶  backend/  Express API
   │  Firebase Auth (sign-in)                         middleware/auth.js         verifies the Firebase ID token
   │  Cloudinary (direct photo upload)                controllers/itemController.js   I-1, validation
   │  OneSignal web SDK (push opt-in)                 services/itemService.js         I-2 createItem
   │                                                   services/matchingService.js     I-3 findMatches (pure)
   │                                                   repositories/                   Firestore or in-memory
   │                                                   adapters/notificationAdapter.js I-4 OneSignal
shared/categories.json   categories + matching settings, read by both sides
firebase/                Firestore rules (deny browser access) and indexes
```

| Contract | Where | Behaviour |
|---|---|---|
| I-1 `POST /api/items` | `itemController.js` | Bearer Firebase ID token. 201 `{itemId, matchCount, notificationStatus}`, 400 with every invalid field, 401, 503 |
| I-2 `createItem(report, uid)` | `itemService.js` | Saves, matches, alerts. Never fails because of a notification problem |
| I-3 `findMatches(newItem, candidates)` | `matchingService.js` | Pure. Same category, opposite type, open. At most 3 `{itemId, score}`, highest first |
| I-4 `sendMatchAlert(ownerUid, message, itemId)` | `notificationAdapter.js` | OneSignal external ID, 5 s timeout, returns `sent` or `failed`, never throws |
| I-5 browser → Cloudinary | `frontend/js/services.js` | Unsigned preset, JPG/PNG/WebP up to 5 MB. A failed upload still lets you post |

**Matching.** Words from the title and description are lowercased, stop words and generic words ("bag", "lost", "item") are dropped, plurals are folded, and per-category synonyms are merged ("phone" = "cellphone"). Each shared word scores 1, a shared color 0.5. A match needs 1.5 (2.5 for "Others"). Tune it in `shared/categories.json`.

**Alerts.** Alerts for all matches are sent in parallel, so a OneSignal outage costs one 5 s timeout, not 5 s per match. If any alert fails the report is still saved and `notificationStatus` is `pending_retry`. Nothing retries those yet.

## Run it locally (no accounts needed)

Requires Node.js 22 or newer (see `.nvmrc`; `engines` in `backend/package.json`).

```bash
git clone https://github.com/Kineticsss/UniFind.git
cd UniFind/backend
npm ci
cp ../.env.example .env      # defaults = demo mode
npm start                    # http://localhost:8080
```

Demo mode uses a fake sign-in (any name), an in-memory database (cleared on restart) and logs alerts to the terminal instead of sending them. Photo upload is off until Cloudinary is configured.

```bash
npm test        # 19 tests, see "Tests" below
```

## Connect the real services

Set these in `backend/.env` locally, or in the Render dashboard. Never commit keys or the service account file; `.gitignore` already blocks them.

1. **Firebase** (LA3 C-03, C-04)
   - Create a project. Authentication → enable Email/Password and Google. Authorized domains: add `localhost` and your Render site domain.
   - Create a Firestore database. Deploy the rules and indexes in `firebase/` (`npx firebase-tools deploy --only firestore`), or paste them in the console.
   - Project settings → Service accounts → Generate new private key. Put `project_id`, `client_email` and `private_key` into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
   - Project settings → General → Your apps → add a Web app. Its `apiKey`, `authDomain`, `projectId`, `appId` go into the frontend config (step 4).
   - Set `AUTH_MODE=firebase` and `STORAGE_MODE=firestore`.
2. **Cloudinary** (C-05): Settings → Upload → add an **unsigned** upload preset. Allowed formats `jpg,png,webp`, max file size 5 MB (5242880 bytes). Set `CLOUDINARY_CLOUD_NAME` on the backend; the preset name goes in the frontend config.
3. **OneSignal** (C-06): create a Web app with your site URL (HTTPS). `frontend/OneSignalSDKWorker.js` is already at the site root. Set `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` and `NOTIFY_MODE=onesignal`. Users turn alerts on from **My reports**.
4. **Frontend config**: `frontend/js/config.js` holds public browser values. For a local run with real services, edit it directly (`authMode: 'firebase'`, Firebase web config, Cloudinary cloud name and preset, OneSignal app ID). On Render it is generated by `frontend/scripts/build-config.js` from env vars.

The backend refuses to start if a selected real service is missing a variable (C-02).

## Deploy on Render

`render.yaml` defines both services. In Render: New → Blueprint → pick this repo, then fill in the variables marked `sync: false`.

- **unifind-api** (Web Service, `backend/`): set `CORS_ORIGINS` and `FRONTEND_URL` to the static site URL.
- **unifind-web** (Static Site, `frontend/`): set `API_BASE_URL` to the API URL, plus the Firebase web config, Cloudinary cloud name and preset, and OneSignal app ID.

Add the static site URL to Firebase authorized domains and to the OneSignal site URL. The free API sleeps after 15 minutes idle and takes about a minute to wake, so open the site a few minutes before a demo.

## API

All `/api/items` routes need `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/categories` | The 8 categories |
| POST | `/api/items` | Body: `type` lost/found, `title` 3–100, `category` slug, `description` ≤500, `location` ≤100 (optional), `date` YYYY-MM-DD not in the future (Philippine time), `imageUrl` optional, must be `https://res.cloudinary.com/<your cloud>/image/upload/...` |
| GET | `/api/items?type=&category=&q=&from=&to=` | Open reports, newest first |
| GET | `/api/items/mine` | Your reports, each with its suggested matches |
| GET | `/api/items/:id` | One report |

Errors: `{ "error": { "code", "message", "fields"? } }`. Codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `NOT_FOUND` 404, `STORAGE_UNAVAILABLE` 503.

Categories: `ids_documents`, `wallets`, `gadgets`, `bags`, `keys`, `school_supplies`, `clothing_accessories`, `others`.

## Data model

Firestore collection `items`, one document per report:

| Field | Type | Notes |
|---|---|---|
| `type` | `lost` \| `found` | |
| `title`, `description`, `location` | string | |
| `category` | string | slug |
| `date` | string | YYYY-MM-DD, when it was lost or found |
| `imageUrl` | string \| null | Cloudinary URL |
| `ownerUid` | string | Firebase UID. Never returned by the API |
| `status` | `open` | reserved for `resolved` later |
| `matches` | `{itemId, score}[]` | Stored on both reports of a match |
| `notificationStatus` | `none` \| `sent` \| `pending_retry` | |
| `createdAt` | string | ISO timestamp |

## Tests

`cd backend && npm test` runs Node's built-in test runner. Names follow LA3 Worksheet B:

| Test | Covers |
|---|---|
| ST-01 | Lost wallet matches an open found wallet, finder alerted, both see the match |
| ST-02 | 2-char title, bad category, 600-char description, future date → 400 listing all four |
| ST-03 | No token / invalid token → 401, nothing saved |
| ST-04 | Data store failure → 503 |
| ST-05 | OneSignal failing on 3 matches → 201, `pending_retry`, alerts overlap in time |
| ST-06 | Synonyms, different categories, generic words |
| ST-07 | Report without a photo is accepted (the browser-side upload rejection needs a manual check) |
| ST-08 | `imageUrl` from another host or Cloudinary account → 400 |
| I-3, I-4, C-02 | Matching rules, OneSignal adapter failures and timeout, missing env vars |

These run against fakes. The real Firebase, Cloudinary and OneSignal checks (Worksheet A, C) still need a manual run once the accounts exist.

## Privacy (Data Privacy Act of 2012)

- The API never returns another user's UID or email. Reports show only what the reporter typed.
- The form asks people not to put ID numbers or other private details in descriptions.
- Browsers cannot read or write Firestore directly (`firebase/firestore.rules`).
- Keys live only in environment variables.

Out of scope: delivery, payment, physical handover, legal ownership verification, other campuses, native mobile apps.
