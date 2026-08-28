# Silent Forward Studio

A private dashboard that prepares, schedules, renders, and publishes Instagram posts and Reels without a laptop running in the background.

## Production architecture

- Vercel: React dashboard and Node.js publishing worker
- Supabase: Postgres queue, settings, worker lease, health state, and one-minute Cron
- Cloudinary: public media hosting
- Instagram Graph API: publishing

See [REMOTE_DEPLOYMENT.md](REMOTE_DEPLOYMENT.md) for production setup and verification.

## Local development

Copy `.env.example` to `.env`, add development credentials, then run:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173` and sign in with the `ADMIN_PASSWORD` value from `.env`.
The local API accepts the Vite development origin even though the UI and API use different
ports. Restart `npm run dev` after changing the password.

Production scheduling is owned exclusively by Supabase Cron. The local worker is disabled by
default so opening the dashboard cannot duplicate remote publishing. Only set
`ENABLE_LOCAL_WORKER=true` when intentionally testing the complete worker locally.

The default editorial cadence is three Reels per day (`09:00`, `15:30`, `21:00`) and two static
posts per week (Tuesday and Saturday at `11:00`) in the configured timezone.

Every successful feed publication also creates a dedicated 9:16 promotional Story. Story delivery
has its own persisted state and retry schedule, so a temporary Story error can never cause the Reel
or feed post to be published twice.

## Growth engine

Autopilot uses original content rather than reposting other creators. Every Reel follows a short
three-act structure: an immediate hook, the core message, and a save/share/follow prompt. Captions
are matched to the message pillar and use a small set of relevant hashtags instead of generic spam.

After publication, the remote worker reads Instagram Insights (views, reach, average watch time,
shares, saves, likes, and comments) and stores a normalized performance score with the post. Future
content uses a controlled explore/exploit strategy: 75% of eligible slots reuse the strongest visual
recipes and 25% test a different recipe. Low-reach results are confidence-weighted so one small post
cannot distort the schedule. Historical posts are mapped to their nearest recipe, allowing the engine
to learn before every item has the new growth metadata.

The `Growth Lab` page exposes the measured signals and recipe ranking. Insights are refreshed by the
one-minute worker, while the authenticated `POST /api/insights/refresh` endpoint can backfill up to
five older publications during maintenance.

## Checks

```bash
npm test
npm run build
```

The test suite renders both an image and a Reel, verifies bundled fonts and text, checks Instagram container readiness, retries, authentication, and timezone handling.
