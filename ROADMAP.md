# SprayWall Roadmap

Notes and implementation ideas to pick up during the Raspberry Pi
migration and beyond. Nothing here is live yet unless listed under
"Current state."

## Current state (built and working)

Frontend (`spraywall-web`, this repo): Vite + React + TypeScript PWA.
- Auth: email/password, JWT in localStorage, login-first gate, auto-logout on 401.
- Wall screen: remote image, SVG hold overlay, pinch/pan zoom
  (react-zoom-pan-pinch), tap to add/remove holds, Detect, Replace photo
  (camera or library), Remove photo.
- PWA: manifest, placeholder icons, iOS "add to home screen" hint.
- Climbs: create flow is a two-step screen. Step 1 taps holds to CYCLE their
  role (hybrid -> start -> foot -> finish -> off); step 2 sets name, description,
  grade dropdown, feet-rules dropdown. Rules enforced: must have a start, a
  finish, and a hybrid; max 2 starts and 2 finishes.
- In-progress climbs auto-save to localStorage (draft keyed per wall, expires
  after 10 min) so a Safari reload mid-build doesn't lose the selection.
- Climb list (tap a row to open), climb detail view (wall lit up with each hold
  in its role color + START/FINISH/FOOT badges), edit (reuses the builder at
  /climbs/:id/edit), and delete (soft-delete via archived_at).
- Profile/settings page: change email, change password, upload a profile photo
  (avatar), sign out. Reached from a profile button on Home.
- Performance: wall photo + avatar URLs are versioned by a content hash and
  cached immutably by the browser, so each image downloads once per device.
  Home prefetches the wall + holds into an in-memory cache so the next screen
  paints instantly.

Backend (`spraywall-backend`): Node/Express + Postgres (Neon), on Render.
- Auth routes: /auth/register, /auth/login, /auth/me, requireAuth middleware.
- Wall photo stored in Postgres as bytea: POST/GET/DELETE /walls/:id/image.
- Detection reads the stored image, calls Roboflow serverless, normalizes to
  0-1 coords. SAM refinement seam is wired but dormant (set SAM_ENDPOINT_URL).
- Image upload validated (mimetype + magic-number byte check).
- Holds are cleared whenever the wall photo changes.
- SAM service scaffold in `sam_service/` (FastAPI, point-prompted Segment Anything).
- Climbs: POST (create), PUT (edit, replaces holds wholesale in a transaction),
  DELETE (soft-delete), GET list, GET /climbs/:id (returns holds WITH their role
  + feet_rules). creator_id comes from the JWT, not the request body.
- Server-side climb validation (shared validateClimbHolds): same start/finish/
  hybrid + 2-start/2-finish rules the UI enforces, so a direct API call can't
  bypass them. Runs on both POST and PUT.
- Profile: PATCH /auth/email (unique-checked), PATCH /auth/password (verifies the
  current password with bcrypt first), POST /auth/avatar, GET /users/:id/avatar.
  Avatars stored as bytea for now; /auth/me returns has_avatar + avatar_version.
- Wall image + avatar responses send immutable Cache-Control; the content hash in
  the URL (md5) busts the cache when the image actually changes.

## Pi migration (infrastructure)

- Move the Node backend + Postgres onto the Pi. Run both as services
  (pm2 or systemd) that start on boot and restart on crash.
- Expose the backend with a free Cloudflare Tunnel for a stable HTTPS URL,
  so phones reach it over cellular with no port forwarding. Run cloudflared
  as a service too.
- Point the PWA's VITE_API_BASE_URL at the tunnel URL.
- Host the static PWA for free (Cloudflare Pages / Netlify) or serve it from
  the Pi. Put a QR code on the wall for one-tap onboarding.
- Set up a simple Postgres backup (pg_dump on a cron) now that user accounts
  and data live on the Pi's disk. SD cards fail.
- Move images off Postgres onto the external drive (see "Image storage" below).
  This is the main reason the current cloud stack has a shelf life: wall photos +
  avatars as bytea will fill Neon's ~0.5 GB free tier.
- Put Postgres itself on the SSD too (not the SD card): more space and far better
  write endurance. Point PGDATA at the mounted drive.

## Image storage (Pi): files on a drive, not Postgres

Today every wall photo and avatar is stored as `bytea` inside Postgres. That is
fine on the cloud for now but is the first thing to hit a wall (Neon free tier is
~0.5 GB, and full-size phone photos are a few MB each). On the Pi with an external
SSD/HDD, switch to the standard pattern: **store the file on disk, store only a
path/filename + metadata in Postgres.** Climb DATA (name, grade, holds, roles)
stays in Postgres - it is tiny. Only the IMAGES move to the drive.

Why this is the right call:
- Postgres stays small and fast; backups shrink to just text/number rows.
- Storage scales with the drive, not a free-tier cap. A 1 TB drive is effectively
  unlimited wall photos.
- Serves fine even from an HDD because the content-hash immutable caching already
  means each image is downloaded once per device and never re-requested. SSD is a
  nice-to-have for snappier first loads + better write endurance, not required.

What changes in code (isolated to the image endpoints - the frontend keeps
calling the same URLs and never knows):
- `POST /walls/:id/image` / `POST /auth/avatar`: write the uploaded (ideally
  downscaled) file to e.g. `/mnt/ssd/spraywall/walls/<id>.jpg`, store the path +
  mime + dims in the row instead of the bytes.
- `GET /walls/:id/image` / `GET /users/:id/avatar`: stream the file from disk (or
  static-serve the folder). Keep the content-hash cache header.

Things to handle that bytea gave for free:
- **Orphaned files.** Deleting a row no longer deletes the file. On photo replace
  or wall/avatar delete, delete the old file too (or a periodic sweep that removes
  files no row references).
- **Backups are now two things.** `pg_dump` for the DB AND an `rsync` of the image
  folder to a second drive. A single external drive is one point of failure, so
  copy it somewhere once real climbs live on it.
- **Downscale on upload** regardless of where it is stored (sharp): cap wall
  photos to a sane max dimension and avatars to ~256x256. Saves space + speeds
  first load. (Flagged as debt below.)

## Feature backlog

### In-app crop step (high value)
After the user picks or shoots a photo, let them drag a box to the wall edges
and crop before upload. Fixes both detection quality (no garage/floor false
positives) and framing. Options: a crop library or a canvas + draggable handles.
Upload the cropped result, not the raw photo.

### Draw / outline tool for resets
A "Draw" mode to hand-trace holds the model missed. Tap to drop polygon
vertices, a Finish button closes the shape, saved as source 'manual' via the
existing POST /walls/:id/holds. Reuses the working tap-to-image-coordinate
mapping, which avoids fighting the zoom library. Freehand is a later polish.

### SAM refinement (fuller outlines)
Deploy `sam_service/` on a scale-to-zero GPU (Modal, Replicate, RunPod, or the
Pi-adjacent box) and set SAM_ENDPOINT_URL on the backend. Turns Roboflow's
rough/partial masks into full hold outlines. Note: it does NOT recover holds the
detector missed entirely, only improves the ones that were found.

### Lift the 300-hold detection cap
Roboflow serverless caps at 300 detections. To go higher, self-host the Roboflow
Inference server (on the Pi or a GPU box, only during a detect) and set
INFERENCE_MODELS_DEFAULT_MAX_DETECTIONS (e.g. 400-500). Only needed if the wall
exceeds ~300 holds.

### Climbs feature (DONE - see Current state)
Create / list / view / edit / delete are built, with roles, validation, and draft
persistence. Still open within this area: tick/send tracking (a personal logbook
of which climbs a user has done), and filtering/sorting the list (by grade, setter,
unsent). Read-open / write-auth is in place: browsing climbs needs no auth, writes
need the token.

## Technical debt / hardening

- (DONE) Climbs endpoint now takes creator_id from req.userId (the token), not the
  request body.
- Downscale images on upload (sharp): wall photos to a max dimension, avatars to
  ~256x256. Avoids storing full-size phone photos. Do this with or before the
  move to disk storage.
- Orphaned image cleanup once images live on disk (see Image storage section).
- Password reset (needs an email sender, e.g. a free tier like Resend). Skipped for now.
- Consider refresh tokens only if session revocation is ever needed (ban a user,
  kill a stolen token). Not needed at current scale.
- HEIC uploads: Roboflow may not decode HEIC. Convert HEIC to JPEG server-side on
  upload (sharp / libheif) if iPhone photos arrive as HEIC.
- Replace the placeholder app icons with a real design.
- WALL_ID is hardcoded in the frontend. Add multi-wall support eventually.

### Climb builder: hold visibility while selecting
When creating a climb, the hold outlines can obscure the holds. Make the holds
easier to see during selection, one of:
- Hide the outlines until a hold is tapped (show only selected holds' outlines).
- Or lower the unselected outlines' opacity so the holds underneath read clearly.
Selected holds stay fully highlighted either way.

### Deploying SAM (currently NOT set up)
Only the service code exists, in `spraywall-backend/sam_service/`. Nothing is
running it yet and the backend has no `SAM_ENDPOINT_URL`, so every SAM call is a
no-op fallback (detect keeps Roboflow polygons; refine returns the raw outlines).
To actually turn SAM on:
1. Host `sam_service/` somewhere that can run it (a few GB RAM; a GPU is faster,
   optional with MobileSAM):
   - Hugging Face Spaces (free CPU, 16GB RAM): slow but free.
   - Modal / Replicate / RunPod: GPU, pay-per-use (some free credits).
   - The Pi, once migrated.
2. Expose it at a public URL ending in `/refine`.
3. Set `SAM_ENDPOINT_URL=<that URL>` in the backend env (Render) and redeploy.
Both `/walls/:id/detect` and `/walls/:id/refine` already call it when the var is
set. The "Done" button in the draw tool hits `/refine`.
