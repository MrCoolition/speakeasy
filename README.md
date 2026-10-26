# Speakeasy

A private, installable speaking companion for iPhone, Android, and desktop. Built with React, TypeScript, Vite, Vercel Functions, and Neon Postgres.

## Run locally

Use Node 22 or newer. Run `npm ci`, `npm run dev`. The frontend works without a database. Local Vite does not emulate the Vercel API, so cloud backup reports that the device copy is saved. To test the full backend, use a Vercel environment configured with a Neon connection string.

`npm test` runs reliability and API boundary tests. `npm run build` type-checks, builds, and generates a versioned offline app shell. `npm run preview` serves that production build.

## Deployment

Repository: `MrCoolition/speakeasy`. Production branch: `main`. Vercel project: `speakeasy`, team `coolition`. The project uses the Vite preset and the `dist` output directory. Vercel builds the root `api/vault.ts` as a Node function. A push to `main` triggers the existing Git integration.

The existing server-only production variable is **`neon_connect`**. `DATABASE_URL` and `POSTGRES_URL` are supported alternatives. Never prefix this with `VITE_`, commit connection strings, or expose database values to the client. The backend creates its additive `speakeasy_vaults` table on first use. No existing data is modified.

## Speaking workflow

- Write, paste, or import `.txt` / `.md` scripts. Blank lines become cue cards; `[brackets]` mark delivery directions.
- Rehearse with a monotonic timer. Save partial and complete rehearsal records.
- Enter stage mode for large cues, adjustable type, optional timed advance, full-script review, keyboard/clicker navigation, a remaining-time display, and screen wake-lock where supported.
- An interrupted session stores its cue and elapsed time locally. Reopen and choose Resume; timing resumes only when the speaker chooses.
- Export plaintext speeches and JSON library backups. Archive, restore, duplicate, search, and filter speeches.
- Install from Safari’s Share → Add to Home Screen, or Chrome’s Install app menu.

## Reliability and privacy model

Writing saves synchronously to versioned browser storage, with a previous recovery copy. Save failures produce a visible warning and an export action. Cloud failures do not block editing or stage mode. A stage session uses a frozen in-memory script and suspends background synchronization. The timer is calculated from `performance.now()` rather than counting interval ticks.

The production service worker precaches the complete app, including fonts. The UI reports offline readiness only after the worker verifies all cached resources. Updates wait for existing windows to close; there is no forced reload during a presentation. Cache availability and screen wake-lock depend on browser/OS support. Wake-lock is requested again on foregrounding. Users should enable Do Not Disturb and check screen auto-lock before presenting. Browser storage can be evicted or cleared; keep exports and the recovery key.

Each installation generates a random 256-bit recovery key. Separate domain-derived keys are used for AES-GCM encryption and the API bearer capability. The encryption key never leaves the client. The server stores only a hash of the capability, ciphertext, revision, and update timestamp. Anyone holding a recovery key has access to its vault; there is no email-based recovery. Device copies, text exports, and normal JSON backups are readable locally. This is a personal capability-based vault, not enterprise SSO or a team administration system.

Cloud writes use optimistic revision checks. Three-way merges preserve both versions of concurrent speech edits as recovered copies. An edit concurrent with deletion is retained. API responses disable caching, validate payloads, and reject cross-site browser requests. Payloads are bounded; browser copies and cloud copies have explicit size limits. For larger public rollouts, configure Vercel WAF rate limits and operational alerting for the vault API.

No system can guarantee zero failures. For executive use, test the actual phone/browser with airplane mode, export a text copy, and keep a second device or printed copy for critical events.
