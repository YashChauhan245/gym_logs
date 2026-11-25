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

For manual hosting, run `npm run prepare:deploy` and deploy the resulting directory. See the [deployment guide](DEPLOY.md) for host settings, optional integrations, and post-deploy checks.

## Nutrition and Gemini

Select a date in the weekly diary to view or edit that day's meals. Amber dots mark dates with food entries. **Log food** lets you pick a meal, then search or reuse a recent food with its last logged portion. Review the portion before saving it to the selected day.

Open **Goal planner** under **Daily totals** for adults aged 20 and over. Enter your age, height, weight, activity, training experience, available gym days, and goal. The planner estimates adult BMI, maintenance energy, daily calories, protein, carbs, fat, and fiber, and suggests a gym schedule. **Use these targets** saves calories, protein, carbs, and fat in the diary. Inputs are used on the device. [CDC adult BMI](https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html), [Energy requirement equations](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html), [Dietary reference values](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html), [Resistance training position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/)

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
- Serwist precaches the shell, fonts, icons, and exercise and nutrition catalogs. Movement images are cached as viewed. Demonstration videos load on demand from the app server. Form instructions and search work offline as soon as the shell reports offline readiness.
- Today puts the workout controls next to the weekly training calendar, with session history below. The interface uses Inter, a warm neutral palette, and amber accents in `src/app/globals.css`.
- `node scripts/import-catalog.mjs` regenerates the 360 exercise entries and 720 preview photos from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db/tree/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5). The Essentials and Popular collections work alongside the muscle-group, target-area, equipment and difficulty filters. The original dataset maintainer advises against commercial reuse of the exercise photos. Obtain permission or replace them before a commercial release. [Upstream image guidance](https://github.com/wrkout/exercises.json/blob/master/CONTRIBUTING.md#exercise-images)
- `src/features/catalog/exercise-media.json` maps exercise IDs to release media with a source, author, license and description of changes. Keep those credits with any redistribution or adaptation of the media. Put cleared files in `public/exercise-media/` and reference them in that manifest to include them in the deployment package. The library also provides a tutorial search link on guides without a bundled demonstration. [wger exercise media](https://wger.readthedocs.io/en/stable/changelog.html) · [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Videos_of_people_demonstrating_strength_training_exercises)
- Progress groups completed workouts by local calendar week and derives sets, load, and heaviest logged sets from the selected workspace. The product overview at `/product` labels its illustrative training data as an example.
- The timer keeps time from a stored deadline and updates when returning to the app. Mobile browsers can suspend background audio and vibration. Dictation uses on-device English speech recognition when the browser and language pack support it. The same offline parser handles typed and pasted text.
- Profile exports a JSON data snapshot (including nutrition entries, targets, and recipes) or a CSV of workout sets. Guest and account workspaces are scoped to the browser and origin. On a phone, use an HTTPS origin for install and offline testing.

## Product artwork

The product page photo is `public/images/liftlog-iron.webp`. It was created with the built-in ImageGen tool and resized and encoded as WebP for the site.

> Use case: ads-marketing. Asset type: editorial landing-page photo for LiftLog, an offline strength-training journal. A close three-quarter floor-level photograph of a single heavy blackened cast-iron weight plate mounted on the end of a knurled steel barbell resting on charcoal rubber lifting tiles, with a faint trace of chalk on the floor. The physical equipment should look ordinary, worn-in, and mechanically plausible. Tight 4:5 portrait crop, weight plate centered slightly right and low, strong silhouette, the steel shaft receding to the upper left. Directional soft copper afternoon light from the right, deep neutral black shadows, restrained warm greys, rich visible detail in the steel and rubber and no stylized rays. Grain and imperfect texture like a premium print editorial. No people, hands, brand markings, legible text, graphic overlays, phones, watermarks, or UI. Compose as a self-contained photo, since all typography is outside the image.

## Supabase sign-in and sync

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using **Supabase → Connect**. Restart the development server, or rebuild before running the production build. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
2. In the project’s SQL Editor, apply each pending migration in `supabase/migrations/` in filename order. They set up private records, sync, gym activity and account roles. Applying migrations requires project dashboard access.
3. In **Authentication → URL Configuration**, set the site URL to the app origin and allow the callback URL for each origin you use. For development, that is `http://localhost:3000/?liftlog_auth=1`. For the production preview on port 3210, use `http://localhost:3210/?liftlog_auth=1`. Register the same callback path on the production domain when deployed. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
4. Under **Profile → Cloud sync**, choose **Personal** or **Gym owner** and request an email sign-in link. Open the link in the same browser. Google sign-in uses the provider configured in the Supabase project. [Google sign-in setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
5. Choose **Import guest data** to bring training records into a personal account or front-desk records into a gym owner account. LiftLog copies local rows after fetching existing cloud data. Repeating the import skips matching IDs and preserves account preferences. The guest copy stays on the device.

Cloud storage uses private per-account records keyed by the corresponding Dexie store and record ID. Each sync batch is staged in IndexedDB before upload, with a receipt on the server for safe retries. The server orders writes per account. Independent rows merge, the most recently accepted regular write wins, and an older edit cannot resurrect a deleted record. Sync runs when the app opens, reconnects, or resumes, and can be triggered from Profile. Workout timer state and Quick Log drafts are device-local.

Deleting an account from Profile deletes the sign-in from the configured Supabase project and removes its synced records. The account workspace on the initiating device is cleared after the server confirms. Guest data stays in its own workspace.

## Gym owner workspace

Open **Gym** in the app navigation (`/#gym`). The owner workspace has:

- A front-desk overview with direct member lookup and check-in, attendance, renewals, and fees to follow up.

- Gym name, contact and logo settings. Downloaded HTML receipts include the gym branding and can be printed or saved as PDFs. Membership plans store duration and INR pricing.
- Member contacts, assigned trainer, training notes, search, status filters, archive/restore and CSV import with a review step.
- Membership history with inclusive dates and fee snapshots, overlap checks, freezes and early resumptions, and renewals that preserve unpaid balances.
- Received-payment records, partial payments, outstanding balances, a monthly collections total, downloadable receipts and CSV ledgers. Corrections and voids preserve the original amount in the activity history.
- Daily check-in/out for active memberships, a historical attendance register and duplicate check-in prevention.
- Upcoming and overdue renewals, fee follow-up lists, reminder text you can copy and send, member and payment CSV exports, and JSON backup and restore for empty workspaces. Profile JSON exports also include gym records.

Gym records use seven Dexie stores in database version 5. Existing workout and nutrition data is preserved. Gym records sync through owner-authenticated RPCs after the Supabase migrations are applied. Each signed-in Gym owner workspace belongs to one account. Local browser storage is accessible to people using the same unlocked browser profile.

For a commercial rollout, use the deployment package with credited replacement exercise media. Configure hosted authentication and verify account sync on two devices before using real member records. The ledger records fees that the gym has already received.

The product page links to `/gym-demo`, where visitors can try a check-in and renewal using sample data. Demo changes live in the page and reset when visitors leave or reset the demo.

## Exercise browsing

The library uses muscle-group buttons followed by a target-area selector, equipment, difficulty, search, favourites and collections. Changing group clears the previous area. **Reset filters** resets the entire query. Group options include biceps, triceps, legs, chest, abs, back, shoulders and forearms. Legs combine quads, hamstrings, calves, glutes, inner-thigh adductors and outer-hip abductors; shoulders distinguish front/side/rear delts and rotator cuff. Biceps filters distinguish short/long-head emphasis and the separate brachialis muscle. Chest and abdominal regional labels describe training emphasis, not anatomical isolation. A movement can match several areas and secondary muscles are opt-in.

`src/domain/exercise-focus.ts` supplies descriptive tags from existing catalogue muscle metadata and movement names. Custom exercises can save an explicit target area. These tags are a browsing aid, not biomechanical measurements. The filter interaction was informed by [Training.fit](https://training.fit/exercise/); no Training.fit images or exercise descriptions were copied.
