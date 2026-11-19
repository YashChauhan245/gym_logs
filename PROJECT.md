# LiftLog

LiftLog is a free, offline-first workout and nutrition tracker. The guest app stores workouts, food logs, recipes, and targets in IndexedDB through Dexie. Core tracking has no required environment variables.

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

## Nutrition and Gemini

Open **Nutrition** to log foods by meal, set a daily calorie and optional macro target, create or adjust recipes, and look back at prior days. Use **Set targets → Estimate maintenance calories** for the 2023 adult maintenance equation. Your age, height, weight, and activity are used on the device for the estimate. Saving a target stores the target values. [Energy requirement equations](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html)

The offline catalog includes 122 entries. Each entry shows its source. Household portions use approximate gram weights. The example recipes are calculated from measured ingredients and cooked yield. Food diary entries retain their original nutrient and portion data when the catalog changes. [USDA SR Legacy and survey downloads](https://fdc.nal.usda.gov/download-datasets/), [Amul Malai Paneer label](https://old.amul.com/products/amul-malaipaneer-info.php)

**Meal assistant** can draft a food log locally from text such as `2 rotis, 1 katori dal, and 100 g paneer`. To enable the online Gemini modes **Log what I ate** and **Build a meal**, create a Google AI Studio key, place it in `.env.local`, and restart the server. `.env.example` lists the settings. [Google AI Studio API keys](https://aistudio.google.com/apikey)

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

The Next.js endpoint uses the key on the server and sends the submitted description and selected mode to Gemini. Diary contents and target settings stay on the device. The assistant returns a draft of foods and portions for review. LiftLog computes nutrition locally from matched food entries and saves only when you confirm. Keep the key in the server environment. For a public deployment, configure Gemini quotas and host-level request limits before enabling this endpoint. [Gemini structured output](https://aistudio.google.com/docs/structured-output)

To regenerate `public/data/foods.json`, download the **FNDDS 2021–2023 JSON** and **SR Legacy April 2018 CSV** ZIPs and pass their local paths to:

```sh
python scripts/import-foods.py path/to/survey-food-json.zip path/to/sr-legacy-food-csv.zip
```

## Architecture

- Next.js prerenders the shell. Tab and workout navigation use URL fragments so that switching screens or opening a saved workout works through the same offline shell. The PWA manifest includes shortcuts into the workout and Quick Log screens.
- `src/db/liftlog.ts` defines versioned Dexie stores for preferences, workouts, exercise blocks, sets, custom exercises, favourites, and device state. Sets use integer grams for calculations and preserve the input weight and unit. The set and its rest deadline commit together. Quick Log commits the sets, custom exercises, and unparsed notes together.
- Serwist precaches the shell, fonts, icons, hero image, and exercise data. Exercise photos are cached as viewed to keep the first offline install small. Form instructions and search work offline as soon as the shell reports offline readiness.
- The 340 catalog exercises and 680 movement photos are sourced from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db/tree/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5) under the included Unlicense. `node scripts/import-catalog.mjs` regenerates the catalog and all movement photos in WebP from the pinned upstream revision. The exercise library filters by primary muscle by default, with an option to include exercises that work that muscle secondarily. The form guide shows both source photos in order and all the written instructions. The Today hero is an original generated asset. The app uses Inter and the charcoal/lime palette documented in `src/app/globals.css`.
- The timer keeps time from a stored deadline and updates when returning to the app. Mobile browsers can suspend background audio and vibration. Dictation uses on-device English speech recognition when the browser and language pack support it. The same offline parser handles typed and pasted text.
- Profile exports a JSON data snapshot (including nutrition entries, targets, and recipes) or a CSV of workout sets. Guest storage is scoped to the browser and origin. On a phone, use an HTTPS origin for install and offline testing. Cloud account sync and imported backups are later milestones.

## Cloud setup later

The accounts milestone adds Supabase Auth, row-level security, background sync backed by an atomic local outbox, and guest migration. The proposed conflict policy orders writes by server revision, merges independent rows, and preserves tombstones against stale edits. Enable Google and magic-link sign-in, apply the migration, and configure the environment only when that milestone is ready. No Supabase or third-party keys are used by Milestone 1.
