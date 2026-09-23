# Automatic publishing for your account

Each person needs **their own Supabase project, Cloudinary account, Meta app, and Vercel site**. One installation publishes to one Instagram account. Do not put your Instagram password in this project.

1. In [Meta for Developers](https://developers.facebook.com/), create an app with **Instagram API with Instagram Login** and connect your Instagram Business account. Get an access token with `instagram_business_basic` and `instagram_business_content_publish`, plus your account ID. Put them in `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_ACCOUNT_ID`. To use someone else's account, that person must authorize the app; Meta may require additional access for people outside your app roles. See [Meta's Instagram Login guide](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login).
2. In [Supabase](https://supabase.com/), create a project and run the files in [`supabase/migrations`](supabase/migrations) in filename order. Copy the **Project URL** and `sb_secret_...` key into `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
3. In [Cloudinary](https://cloudinary.com/), copy your cloud name, API key, and API secret into the three `CLOUDINARY_*` fields in [`.env.example`](.env.example).
4. Fork this project on GitHub and import your fork into [Vercel](https://vercel.com/). Under **Environment Variables**, add every value from `.env.example` except `API_PORT` and `ENABLE_LOCAL_WORKER`. Choose an `ADMIN_PASSWORD` for the dashboard and two different, long values for `SESSION_SECRET` and `SCHEDULER_SECRET`. Run this command once for each secret. Set `INSTAGRAM_USERNAME` without `@` and `BRAND_NAME` for the text on generated media. Deploy and open your new Vercel URL.

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. In **Supabase → Vault**, add `publisher_worker_url` with `https://YOUR-VERCEL-URL/api/worker/run`, and `publisher_scheduler_secret` with the same value as Vercel's `SCHEDULER_SECRET`. In **SQL Editor**, run:

   ```sql
   select public.install_remote_publisher_schedule();
   ```

Supabase checks due work in PostgreSQL every minute and calls Vercel only for a due post, Story, expired claim, or hourly maintenance. This keeps scheduled publishing close to the selected minute and catches work missed during a deploy or outage. In the dashboard, check the Instagram account name and last worker run under **Settings**, then schedule a test post. When it looks right, turn on **Autopilot** under **Automation**. It prepares three Reels a day and two posts a week in your selected time zone; each publication also creates a Story. Leave `ENABLE_LOCAL_WORKER` off when online automation is active.

Meta tokens can expire. If the Instagram connection stops working, get a new token, update `INSTAGRAM_ACCESS_TOKEN` in Vercel, and redeploy. The app does not refresh tokens automatically.
