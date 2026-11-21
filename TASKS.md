# LiftLog milestones

## 1. Guest workout logging

- [x] Next.js, TypeScript, Tailwind, shadcn-style accessible primitives, and CI workflow
- [x] Guest Dexie data, training preferences, units, and local export and deletion
- [x] Install manifest, icons, Android prompt, Safari guide, and offline service worker
- [x] Library of 340 exercises with thumbnails, two movement photos per guide, ordered form instructions, primary-muscle and equipment filters, favourites, and custom entries
- [x] Active workout resume, manual set logging, previous-set defaults, exercise and workout notes, rest timer, and finish summary
- [x] Quick Log from Today or the workout screen, with editable preview, typo suggestions, custom movements, and unchanged note lines
- [x] Lint, strict type checks, production build, 65 unit tests, and 7 browser checks across Chromium and mobile WebKit
- [x] Lighthouse mobile lab scores on Today were 95 Performance and 100 Accessibility. First contentful paint was 0.8 s and largest contentful paint was 2.9 s.
- [ ] Android and iPhone testing on real devices, including installation and background behavior

### Manual device checklist

- [ ] Android Chrome on HTTPS. Install when the prompt is available and launch from the home screen.
- [ ] iPhone Safari on HTTPS. Follow the in-app guide and launch from the home screen. Check whether browser-session guest history carries over to the installed app.
- [ ] On both phones, wait for Offline ready, enable airplane mode, force-close, reopen, and start or resume a workout.
- [ ] Search the exercise library offline. Log a set and verify that the rest timer starts. Lock and unlock the screen, then check the deadline and wake-lock behavior.
- [ ] Paste `Bench press 60kg x 8, 8, 6` and an unstructured note into Quick Log. Edit a rep in the preview, save, reload, finish, and confirm totals and notes in history.
- [ ] Verify large text and TalkBack or VoiceOver. Measure cold-load and set-feedback times on a mid-range Android phone over 4G.

## 2. Routines and progress

- [ ] Reusable templates, starter programs, ordering, and start from a previous workout
- [ ] PR rules and celebrations, lifting charts, bodyweight, and measurements

## 3. Nutrition

- [x] Calorie and macro targets, adult maintenance estimator, offline meal diary, and per-food and daily totals
- [x] Offline Indian food seed with 122 entries, common portion units, source details, custom foods, and adjustable recipes
- [x] Offline text drafting and optional server-side Gemini meal drafting and planning with review before saving
- [x] Verify logged totals, recipe adjustments, existing workout preservation, and Gemini review with simulated responses. Build, type checks, 77 unit tests, and 13 browser checks passed.
- [ ] Connect a Gemini key and verify live responses with the configured account
- [ ] Connected food search, barcode scanning, favourites and recents, meal copying, water, and weekly summaries

## 4. Accounts and sync

- [x] Supabase migration, private owner-scoped sync RPCs, email and Google sign-in UI, and guest import
- [x] Local outbox, retry and conflict checks, separate account workspaces, export, and confirmed account deletion
- [x] Lint, type checks, production build, 86 unit tests, and 15 browser checks. The cloud browser test uses a simulated Supabase session and responses.
- [ ] Apply the migration to the hosted Supabase project, configure redirect URLs and auth providers, and test live sign-in on two devices
- [ ] Web Push reminders

## 5. Training tools and polish

- [ ] Progression and deload suggestions, calculators, heat map, photos, share cards, Hindi, and accessibility audit

## 6. Optional form review

- [ ] On-device rep counting and approximate feedback with local video review
