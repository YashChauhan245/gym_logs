# Deploy LiftLog

Use the extracted deployment package as the project root. It includes the free guest app, the product page, the written exercise guides, and the optional Supabase migration. The original catalog maintainer advises against redistributing the bundled exercise photos, so the package ships the written guides with the same exercise IDs and filters. [Upstream image guidance](https://github.com/wrkout/exercises.json/blob/master/CONTRIBUTING.md#exercise-images)

## Choose a host

Select **Node.js 24** on a host that supports Next.js server routes. For a self-hosted Node server, point your HTTPS reverse proxy at the port used by `npm start`. [Next.js deployment options](https://nextjs.org/docs/app/getting-started/deploying)

```sh
npm ci
npm run build
npm start
```

On Vercel, import a repository created from the extracted package, or run `npx vercel deploy --prod` from that directory when you’re ready to publish. Use the **Next.js** framework preset and `npm run build` as the build command. [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) · [Vercel CLI deploy](https://vercel.com/docs/cli/deploy)

## Configure optional features

Guest mode works with the variables in `.env.example` left blank. Enter values in your host’s environment settings before building if you enable these features. [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)

| Feature | Variables |
| --- | --- |
| Account sync | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Online meal assistant | Server-only `GEMINI_API_KEY` and optional `GEMINI_MODEL` |

For account sync, apply the bundled `supabase/migrations/202611210001_liftlog_sync.sql` to your project. Set the Supabase Auth Site URL to your deployed origin and add `https://YOUR-DOMAIN/?liftlog_auth=1` to the redirect allowlist. Enable Google sign-in if you want it available. Verify sign-in and confirm a workout syncs to a second browser. [Supabase setup](PROJECT.md#supabase-sign-in-and-sync) · [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

After deployment, open `/product` and `/`, wait for **Offline ready**, and test logging a set after disconnecting. Verify that `/manifest.webmanifest` and `/sw.js` return successfully over HTTPS.

## Rebuild the deployment package

Run `npm run prepare:deploy` from the working repository. It prints the path to a fresh directory under `.deploy/`. Use that directory as the deployment root. It contains only the source, build configuration, migrations, and public files selected by the packaging script.
