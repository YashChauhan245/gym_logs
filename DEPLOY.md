# Deploy LiftLog

Use the extracted deployment package as the project root. It includes the guest app, the gym owner workspace, 360 written exercise guides, credited movement images and demonstration videos for selected guides, and the Supabase migrations. Guides link to each media source and license. The package excludes the legacy preview photos. [Upstream image guidance](https://github.com/wrkout/exercises.json/blob/master/CONTRIBUTING.md#exercise-images)

## Choose a host

Select **Node.js 24** on a host that supports Next.js server routes. For a self-hosted Node server, point your HTTPS reverse proxy at the port used by `npm start`. [Next.js deployment options](https://nextjs.org/docs/app/getting-started/deploying)

```sh
npm ci
npm run build
npm start
```

On Vercel, import a repository created from the extracted package, or run `npx vercel deploy --prod` from that directory when you’re ready to publish. The package pins Node.js 24 and configures **Next.js** with `npm run build`, which also creates the offline service worker. If you use Vercel to sell the product to gyms, Vercel requires a commercial plan for that use. [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) · [Vercel CLI deploy](https://vercel.com/docs/cli/deploy) · [Vercel commercial use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)

## Configure optional features

Guest mode works with the variables in `.env.example` left blank. Enter values in your host’s environment settings before building if you enable these features. [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)

| Feature | Variables |
| --- | --- |
| Account sync | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Online meal assistant | Server-only `GEMINI_API_KEY` and optional `GEMINI_MODEL` |

For account sync, apply any pending migrations in order:

1. `supabase/migrations/202611210001_liftlog_sync.sql` creates the sync transport.
2. `supabase/migrations/202611250001_gym_management.sql` adds gym record sync.
3. `supabase/migrations/202611250002_gym_operations.sql` adds append-only gym activity, including payment corrections and freezes.
4. `supabase/migrations/202611250003_account_roles.sql` separates personal accounts and gym-owner accounts.

Set the Supabase Auth Site URL to your deployed origin and add `https://YOUR-DOMAIN/?liftlog_auth=1` to the redirect allowlist. Enable Google sign-in if you want it available. Reload older open app tabs after deploying the matching build. Verify sign-in and confirm a workout and a sample gym activity entry sync to a second browser. [Supabase setup](PROJECT.md#supabase-sign-in-and-sync) · [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

After deployment, open `/product` and `/`, wait for **Offline ready**, and test logging a set after disconnecting. Verify that `/manifest.webmanifest` and `/sw.js` return successfully over HTTPS.

In **Workouts → Browse exercises**, enable **With demo video**, open **Barbell Bench Press**, and play the clip. The videos stream from the deployment. Text guides and previously loaded movement images remain available offline.

## Rebuild the deployment package

Run `npm run prepare:deploy` from the working repository. It prints the path to a fresh directory under `.deploy/`. Use that directory as the deployment root. It contains only the source, build configuration, migrations, and public files selected by the packaging script.

For a gym-owner rollout, open `/#gym` on desktop and mobile. Create a plan and a member, log a partial payment, check in and out, renew the membership, and restore a backup into an empty workspace. Sign in and verify sync from a second browser. Each gym workspace belongs to one owner account.

Open `/gym-demo` from `/product` and try the sample check-in. Under real **Gym settings**, save a gym name and logo, then download a receipt to verify the branding.

Use a sample CSV to check the member preview, correct a test fee, and freeze a membership with an upcoming renewal. The [README](README.md#owner-workflow) covers these flows and their effect on balances and dates.
