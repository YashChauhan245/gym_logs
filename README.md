# LiftLog

LiftLog combines a gym front desk with an offline workout and nutrition journal. Gym owners can manage members, attendance, renewals, and fees from one workspace. Trainers and lifters can use the exercise library, workout log, and nutrition planner on the same device. Optional Supabase Auth enables account sync.

## Accounts

Open **Profile → Cloud sync** to choose **Personal** or **Gym owner** before signing in by email link or Google. Personal profiles open the training and nutrition workspace. Gym owner profiles open the front desk and owner settings. Use separate email addresses for separate account types. Existing accounts that already synced gym data keep access as gym owners.

Supabase stores the account type for each signed-in user and restricts gym records to that owner’s workspace. Guest users can use the local gym and training tools. When you import guest data into a signed-in account, LiftLog copies the records for that account type.

| Route | What you can do |
| --- | --- |
| `/` | Open the training journal and app navigation |
| `/#gym` | Run the gym front desk |
| `/gym-demo` | Try check-ins and renewals with sample records |
| `/product` | View the product page and demo preview |

## Features

### Gym management

- **Front desk.** Find members by name, phone, or email. Check them in and out and see today’s attendance. Check-in requires an active membership for that date.
- **Members and plans.** Register members, assign trainers, configure membership prices and durations, archive members, and review membership history.
- **CSV onboarding.** Review new members and plans before importing. The preview flags duplicate contacts, invalid dates, and missing plan details. Export the member register or save a full gym backup as JSON.
- **Renewals and freezes.** Review upcoming and overdue renewals. Pause check-in between two dates, extend expiry by the paused days, and resume early when needed.
- **Fee records.** Track received cash, UPI, card, or bank transfers, including partial payments. View outstanding balances and download printable branded receipts.
- **Corrections and activity.** Correct a recorded amount or void it by entering zero. The original amount, reason, timestamp, and actor stay in the activity history. The ledger uses the corrected amount on the original payment date.
- **Gym branding.** Add a gym name, logo, and contact phone. Receipts carry the logo, and copied renewal reminders carry the gym name and contact details.

### Training and nutrition

- **Workout logging.** Start a session, add exercises, record working and warm-up sets, and use the rest timer. Quick Log turns pasted workout notes into editable sets.
- **Exercise library.** Browse 360 written form guides by muscle group, target area, equipment, and difficulty. Selected guides include credited movement images or playable demos. Save favourites or add your own exercises.
- **Progress.** Review completed sessions, weekly training totals, lift history, and your heaviest sets.
- **Nutrition.** Search the food catalog, log meals and portions, and save custom foods. Use the adult Goal Planner for BMI, calorie, macro and fibre estimates, and suggested training schedules. The Gemini meal assistant is optional.
- **Offline use.** The installable web app stores workouts, nutrition and gym records in the browser. The service worker caches the app, catalogs and previously viewed movement images. Videos and the online meal assistant need a connection.

## Owner workflow

1. Open **Gym → Settings** and add the gym name, logo, and contact phone.
2. Create a plan in **Plans** or supply the plan details during a member import.
3. Register a member with **Add member**, or open **Members → Import members CSV** to review a spreadsheet.
4. Use **Check in member** at reception. Review open visits, upcoming renewals and overdue memberships on the overview.
5. Open a member to renew a plan, schedule a freeze, or record fees already received. Open **Payments** for the ledger and receipts.
6. Use **Correct amount** when a fee entry needs a change. Review the reason and actor under **Activity**.
7. Download a JSON backup and test restoring it into an empty workspace. The backup includes gym records and activity history.

### Import members from a spreadsheet

Download the template from **Members → Import members CSV**. Save the spreadsheet as a CSV using UTF-8. The `Name` column is required. Phone, email, trainer, and notes are optional. To import a membership, include `Plan` and `Start`. Use `YYYY-MM-DD` dates. `End` defaults to the end of the selected plan’s duration.

```csv
Name,Phone,Email,Trainer,Notes,Plan,Start,End,Fee INR,Outstanding INR,Duration days
Asha Patel,,asha@example.invalid,,,Monthly,2026-11-01,2026-11-30,1500,500,30
```

Plan names are matched to existing plans. Supply `Fee INR` and `Duration days` on the first row for each new plan. For an existing plan, `Fee INR` can override the price for that member’s imported period. Leave the plan and date fields blank to import a member profile on its own.

`Outstanding INR` defaults to zero. The difference between the period fee and the outstanding amount becomes opening credit. Opening credit reduces the balance without being counted as a newly received payment. The app previews up to 1,000 records from a file up to 1 MB. Review skipped rows before confirming the rows marked ready.

### Fee corrections and freezes

- Open **Payments → Correct amount**, enter the amount and a reason, and save. Enter zero to void a mistaken entry in LiftLog. The correction itself does not move money or issue a refund.
- Open a member’s **Membership history → Freeze plan** and choose the first and last freeze days. Both dates count. Later periods move forward only when needed to avoid overlap. **Resume early** removes unused freeze days, and **Cancel freeze** clears a future pause. Both actions leave an activity entry.
- Use **Members → Status → Overdue renewals** to find expired memberships without a current or scheduled renewal. Open a member to renew or copy a follow-up reminder.

## Run locally

Install **Node.js 24** and npm, then run these commands at the project root.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Guest mode works with a blank environment. To test the service worker and app installation, use the production server.

```sh
npm run build
npm start
```

### Optional integrations

Copy `.env.example` to `.env.local` for local settings. Set production values in your host’s environment settings before building. Keep API secrets out of GitHub.

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for sign-in and sync |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key for the browser client |
| `GEMINI_API_KEY` | Server-only key for the Gemini meal assistant |
| `GEMINI_MODEL` | Optional Gemini model override |

For sign-in and sync, apply the SQL files in `supabase/migrations/` in filename order. On an existing project, apply migrations that are still pending. They set up private sync, gym records, append-only activity, and account roles. Set the Supabase Auth Site URL to the deployed origin and allow `https://YOUR-DOMAIN/?liftlog_auth=1` as a sign-in redirect. See the [deployment guide](DEPLOY.md) and [Supabase setup](PROJECT.md#supabase-sign-in-and-sync).

Each gym workspace is owned by one account. In guest mode, data stays in the active browser profile. With account sync enabled, the owner can access the workspace from another signed-in device. Activity shows the signed-in account email when available and labels guest activity **This device**.

## Verify and deploy

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

The unit suite covers storage upgrades, gym operations, nutrition, workouts, and the Supabase SQL in a local PostgreSQL runtime. Browser tests cover desktop Chromium and mobile WebKit. Cloud browser tests use simulated responses and require a build with Supabase environment settings.

Run `npm run prepare:deploy` to create a clean release directory under `.deploy/`. Use the generated directory, or extract the provided deployment ZIP, as the root of the Next.js project in Vercel. The release includes the migrations and credited media selected for redistribution. Follow [DEPLOY.md](DEPLOY.md) for the build command, environment, and post-deploy checks.

Before using real member data, verify sign-in, cross-device sync, and JSON backup restore with a sample gym. For manual deployment, also verify the payment ledger, overdue filter, and video playback on the deployed URL.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/app` | Next.js routes, API handlers, and service worker |
| `src/features` | Gym, catalog, workout, nutrition, and profile screens |
| `src/domain` | Validation, date and fee rules, CSV review, and training calculations |
| `src/db` | Dexie stores, guest and owner workspaces, and local transactions |
| `src/cloud` | Supabase Auth and account sync |
| `supabase/migrations` | Owner-private cloud storage policies and sync functions |
| `tests` | Unit and browser tests |

Credit and license information for bundled exercise media appears inside the guide and in `src/features/catalog/exercise-media.json`. The release package excludes legacy preview photos whose redistribution rights were unconfirmed. See [PROJECT.md](PROJECT.md) for media sources and maintenance notes.
