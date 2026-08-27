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

The local API keeps its own minute scheduler for development. Production scheduling is owned exclusively by Supabase Cron.

## Checks

```bash
npm test
npm run build
```

The test suite renders both an image and a Reel, verifies bundled fonts and text, checks Instagram container readiness, retries, authentication, and timezone handling.
