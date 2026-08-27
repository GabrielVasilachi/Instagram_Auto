# Remote deployment

Production uses four services, all independent of the local laptop:

- Vercel serves the private dashboard and the Node.js publishing worker.
- Supabase stores settings, the queue, worker state, and the one-minute cron job.
- Cloudinary stores the rendered image or Reel at a public HTTPS URL.
- Instagram Graph API creates and publishes the Instagram media container.

GitHub Actions is intentionally manual-only. It is a recovery button, not the production clock.

## Vercel environment

Configure these variables for Production, Preview, and Development when appropriate:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_ACCOUNT_ID`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `SCHEDULER_SECRET`

`SCHEDULER_SECRET` must be a long random value used only by Supabase Cron. The worker endpoint accepts it through the `X-Scheduler-Secret` header.

## Supabase setup

1. Apply the migrations in `supabase/migrations` in filename order.
2. Open Supabase Vault and create these encrypted secrets:
   - `publisher_worker_url`: `https://instagram-auto-xi.vercel.app/api/worker/run`
   - `publisher_scheduler_secret`: the same value as Vercel `SCHEDULER_SECRET`
3. Run:

```sql
select public.install_remote_publisher_schedule();
```

The installed cron job calls Vercel once per minute. The worker uses a database lease so overlapping HTTP calls cannot publish the same item or fill the automatic queue twice.

## Verification

The dashboard shows the last worker run. A healthy installation updates that timestamp every minute even when no post is due.

For a direct check, inspect the latest `pg_net` responses:

```sql
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 20;
```

The manual GitHub workflow can still be started from Actions if Supabase Cron or Vercel has a temporary incident.
