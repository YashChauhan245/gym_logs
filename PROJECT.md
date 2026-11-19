# LiftLog

LiftLog is a free, offline-first workout tracker. Milestone 1 runs as a guest application and stores workout data in IndexedDB through Dexie. It has no required environment variables.

## Run locally

Install Node.js 24 LTS and run these commands from the project directory. On Windows PowerShell, use `npm.cmd` if script execution prevents `npm` from opening.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000` for development. The service worker is enabled in the production build. Use that build for installation and offline checks.

```sh
npm run build
npm run start
```

## Verify

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium webkit
npm run build
npm run test:e2e
```

The Playwright suite starts a production server on port 3210. It exercises offline logging and reload in Chromium and mobile WebKit and runs axe on Today and Quick Log. It uses isolated browser contexts and disposable data.

## Architecture

- Next.js prerenders the shell. Tab and workout navigation use URL fragments so that switching screens or opening a saved workout works through the same offline shell. The PWA manifest includes shortcuts into the workout and Quick Log screens.
- `src/db/liftlog.ts` defines versioned Dexie stores for preferences, workouts, exercise blocks, sets, custom exercises, favourites, and device state. Sets use integer grams for calculations and preserve the input weight and unit. The set and its rest deadline commit together. Quick Log commits the sets, custom exercises, and unparsed notes together.
- Serwist precaches the shell, fonts, icons, hero image, and exercise data. Exercise photos are cached as viewed to keep the first offline install small. Form instructions and search work offline as soon as the shell reports offline readiness.
- The 340 catalog exercises and images are sourced from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db/tree/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5) under the included Unlicense. `node scripts/import-catalog.mjs` regenerates the catalog and first-frame WebP images from the pinned upstream revision. The Today hero is an original generated asset. The app uses Inter and the charcoal/lime palette documented in `src/app/globals.css`.
- The timer keeps time from a stored deadline and updates when returning to the app. Mobile browsers can suspend background audio and vibration. Dictation uses on-device English speech recognition when the browser and language pack support it. The same offline parser handles typed and pasted text.
- Profile exports a JSON data snapshot or a CSV of workout sets. Guest storage is scoped to the browser and origin. On a phone, use an HTTPS origin for install and offline testing. Cloud account sync and imported backups are later milestones.

## Cloud setup later

The accounts milestone adds Supabase Auth, row-level security, background sync backed by an atomic local outbox, and guest migration. The proposed conflict policy orders writes by server revision, merges independent rows, and preserves tombstones against stale edits. Enable Google and magic-link sign-in, apply the migration, and configure the environment only when that milestone is ready. No Supabase or third-party keys are used by Milestone 1.
