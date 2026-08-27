# Google Cloud deployment

The production target is one request-billed Cloud Run service plus one Cloud Scheduler job. The service hosts the dashboard and exposes a protected worker endpoint. Cloud Scheduler calls that endpoint every minute, so content is normally picked up within one minute of its configured time.

## Required service configuration

- Region: `europe-west1`
- CPU: 1
- Memory: 1 GiB
- Request timeout: 900 seconds
- Minimum instances: 0
- Maximum instances: 1
- Concurrency: 1
- Public access: enabled for the password-protected dashboard

Set these non-secret environment variables:

- `REMOTE_SCHEDULER=true`
- `SERVE_DASHBOARD=true`
- `SUPABASE_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `INSTAGRAM_ACCOUNT_ID`

Store these values in Secret Manager and expose them as environment variables:

- `SUPABASE_SECRET_KEY`
- `CLOUDINARY_API_SECRET`
- `INSTAGRAM_ACCESS_TOKEN`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `SCHEDULER_SECRET`

## Scheduler

Create one HTTP Cloud Scheduler job:

- Schedule: `* * * * *`
- Time zone: `Europe/Chisinau`
- Method: `POST`
- URL: `<cloud-run-url>/api/worker/run`
- Header: `X-Scheduler-Secret: <SCHEDULER_SECRET>`
- Attempt deadline: 900 seconds
- Retry count: 3

The worker claims each post before publishing, retries temporary service failures, delays subsequent attempts, and refuses concurrent claims. An interrupted publishing lease is moved to `failed` for review instead of risking a duplicate Instagram post.
