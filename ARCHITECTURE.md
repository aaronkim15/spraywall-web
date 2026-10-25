# SprayWall Architecture

A reference for how the app is put together: the system, the data model,
the recurring patterns, and the structural decisions ahead. Paired with
`ROADMAP.md` (what to build next) — this file is "how it's shaped."

## 1. Overview

SprayWall is a PWA for logging and sharing climbs on a friend's home spray
wall. Three tiers:

- **Frontend** (`spraywall-web`): Vite + React + TypeScript PWA. Installs to
  an iPhone home screen via URL/QR. Talks to the backend over HTTPS.
- **Backend** (`spraywall-backend`): Node + Express REST API. One process.
- **Database**: PostgreSQL. Holds users, the wall, holds, climbs, sends.

Read-open / write-auth: browsing is public, anything that changes data needs
a JWT. The whole app currently sits behind a login gate in the UI, but the
backend enforces auth per-endpoint, not globally.

## 2. System shape

```
 iPhone / browser (PWA)
        |  HTTPS (JWT in localStorage)
        v
 Express API  ──────────────►  PostgreSQL
   (index.js)                   (users, walls, holds,
        |                        climbs, climb_holds, climb_sends)
        └─► Roboflow (hold detection, serverless)
        └─► SAM service (outline refinement, dormant)
```

Hosting today: backend on **Render** (free tier), Postgres on **Neon** (free
tier), frontend served via the Vite dev server + a Cloudflare quick tunnel for
phone testing. Future: all of it on a **Raspberry Pi** (see §8).

## 3. Data model

```
users ──1:N──► climbs (creator_id)
users ──1:N──► climb_sends (user_id)
walls ──1:N──► holds (wall_id)
walls ──1:N──► climbs (wall_id)
climbs ─M:N─► holds   (via climb_holds, each link carries a role)
climbs ─1:N─► climb_sends
```

- **users**: id, name (NOT NULL), email, password_hash (bcrypt), display_name,
  avatar_data (bytea), avatar_mime.
- **walls**: id, name, location, image_data (bytea), image_mime,
  image_width, image_height. (`image_version` = md5(image_data), computed.)
- **holds**: id, wall_id, x_pos, y_pos (normalized 0–1 centre), points (jsonb
  polygon, normalized), source ('roboflow' | 'manual' | 'sam').
- **climbs**: id, wall_id, creator_id, name, grade, description, feet_rules,
  created_at, archived_at (soft delete), thumb_data (bytea), thumb_mime.
- **climb_holds**: climb_id, hold_id, role ('start' | 'hand' | 'foot' |
  'finish'). The join table that defines a climb.
- **climb_sends**: id, climb_id, user_id, attempts, created_at. A send history
  log — multiple rows per user allowed (one per ascent).

Key idea: **a climb owns no geometry.** Holds are independent records on the
wall; a climb is just a set of references to them, each tagged with a role.
That's why volume-vs-hold is "which hold ids you picked," and why editing a
climb replaces its `climb_holds` rows wholesale.

## 4. Frontend structure

```
src/
  api/        network layer — one module per resource
    client.ts   fetch wrapper: attaches JWT, JSON-encodes, 401 -> global logout
    auth.ts     login/register/me, email/password/avatar
    walls.ts    wall + holds + photo + detect + refine, in-memory cache, prefetch
    climbs.ts   climbs CRUD, sends, thumbnails, list types
  auth/
    AuthContext.tsx   user state, login/register/logout/refreshUser, boot from token
    LoginScreen / RegisterScreen
  pages/       one screen each (Home, Wall, CreateClimb, ClimbsList, ClimbDetail, Profile)
  components/  reusable UI (CropModal, InstallHint)
  lib/roles.ts shared role colors/labels/on-hold text (single source of truth)
  utils/holds.ts  point-in-polygon, area, findHoldAtPoint (smallest-wins)
  config.ts    API_BASE_URL (env-driven)
  App.tsx      routing + the login gate
  index.css    all styles (global)
```

Discipline worth keeping: **screens don't call `fetch`.** They call typed
functions in `api/`, which go through `client.ts`. That one wrapper owns auth
headers and the 401 → logout behavior, so no screen re-implements it.

## 5. Backend structure

```
spraywall-backend/
  index.js            app setup: cors, json, mount routers, listen
  db.js               the pg Pool (one instance, required where needed)
  middleware/auth.js  requireAuth, optionalAuth, JWT_SECRET, TOKEN_TTL
  lib/
    images.js         multer upload, isImageBuffer, generateThumb (+ ROLE_HEX)
    sam.js            SAM_ENDPOINT, refineWithSam
    validation.js     validateClimbHolds
  routes/
    health.js         /health
    auth.js           /auth/*, /users/:id/avatar
    walls.js          /walls*, /holds/:id, detect, refine
    climbs.js         /climbs*, /climbs/sends/:sendId
  migrations/         ordered .sql schema files (see migrations/README.md)
```

Each router defines its full paths and is mounted at the root in `index.js`.
Shared state (the pool) lives in `db.js` and is required by whoever needs it —
no global passing. `sam_service/` is a separate FastAPI scaffold (MobileSAM),
not deployed; the backend no-ops SAM calls until `SAM_ENDPOINT_URL` is set.

## 6. Cross-cutting patterns (the reusable ideas)

These recur across the app; worth recognizing by name:

- **Content-hash caching.** Wall photos, avatars, and climb thumbnails are
  served `immutable` and their URLs carry an md5 of the bytes. Change the
  image → hash changes → URL changes → browser refetches. Each image downloads
  once per device, ever.
- **Precompute + cache + narrow invalidation.** Climb thumbnails are rendered
  once (sharp composites holds over the photo), stored on the row, and only
  regenerated when that climb's holds or the wall photo change. Reads are cheap
  and constant-cost; the work moves to (rare) writes.
- **Lazy + prefetch.** Thumbnails use native `loading="lazy"` (only visible
  rows fetch). The full wall photo is prefetched on the list so opening a climb
  is instant. "Do the slow part before the user asks."
- **Derived state, not duplicated state.** The climb list's search/sort/filter
  is computed from one source list via `useMemo`; the filtered view is never
  stored separately.
- **Draft vs applied state.** The sort menu stages changes and commits them on
  Apply; the display reads only the applied values.
- **Optional auth for read-open endpoints.** `optionalAuth` reads the JWT if
  present (adds `sent_by_me` etc.) but never rejects, so browsing stays public.
- **Validation lives on the server.** Climb rules (start/finish/hybrid required,
  ≤2 starts/finishes) are enforced in the API, not just the UI. The client
  check is UX; the server check is integrity.
- **Local draft persistence.** In-progress climbs auto-save to localStorage
  with a 10-minute TTL, so a Safari reload mid-build doesn't lose work.

## 7. Hosting & deploy

- **Backend**: push to GitHub → Render builds (`npm install`) and runs. Free
  tier often needs a Manual Deploy and cold-starts after idle (~30–50s).
- **Database**: Neon. **Schema changes are hand-run SQL** in the Neon console
  — there is no migration framework yet (see §9).
- **Frontend**: Vite dev server; phone access via Cloudflare quick tunnel
  (`cloudflared tunnel --url http://localhost:5173`), which also gives HTTPS so
  PWA install works. `server.host` + `allowedHosts` are set for this.
- **Config**: `VITE_API_BASE_URL` points the PWA at the backend. Everything
  env-driven, so re-pointing at the Pi later is a one-line change.

## 8. Planned architecture changes

- **Wall versioning + compress-on-retire** (for climb history). One logical
  wall, a *timeline* of layouts. Resetting the wall creates a new active layout
  and archives the old one; on archive, the old photo is downscaled with sharp
  (~4 MB → ~150 KB) while its holds + climbs (already tiny) are kept read-only.
  Cost per archived layout is one small image, bounded by resets (rare), not
  climbs (many). `WALL_ID` becomes "current active layout." NOT multi-wall —
  one wall across time, not many walls.
- **Pi migration** (see ROADMAP). Backend + Postgres on the Pi, Cloudflare
  Tunnel for a stable HTTPS URL, static PWA hosted free.
- **Images to disk/SSD** (see ROADMAP). Store photos/avatars/thumbnails as
  files on the drive, keep only a path + metadata in Postgres. Frontend
  unchanged (same URLs). Removes the Neon storage ceiling.

## 9. Structure review — what's solid, what's debt

Solid:
- Clean frontend separation (api / auth / pages / components / lib / utils).
- Typed client/server contracts; one fetch wrapper owns auth + 401.
- Single source of truth for role styling (`lib/roles.ts`).
- Consistent, deliberate caching/perf patterns (§6).

Resolved (2026-10-25):
- **Backend split** from one 785-line `index.js` into `db.js` +
  `middleware/` + `lib/` + `routes/` (see §5).
- **Migration tracking** added (`migrations/` with an ordered baseline;
  replace the reconstructed baseline with a `pg_dump` before the Pi move).
- **`WALL_ID` centralized** into `src/config.ts` (frontend).
- **Stray backend experiment files** gitignored (run `git rm --cached` once
  to untrack the already-committed ones).

Still open (none urgent):
- **All CSS in one `index.css`.** Fine at this size; consider per-feature CSS
  or CSS modules if it gets unwieldy.
- **Password reset / account recovery** not built (needs an email sender).
