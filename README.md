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

## Checks

```bash
npm test
npm run build
```

The test suite renders both an image and a Reel, verifies bundled fonts and text, checks Instagram container readiness, retries, authentication, and timezone handling.
