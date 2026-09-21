# Silent Forward Studio

This app creates and schedules Instagram posts, Reels, and Stories for **one Instagram account per installation**. The dashboard shows your calendar and results. With Vercel and Supabase set up, automatic publishing keeps running when your computer is off.

## First-time setup

You need [Node.js 22](https://nodejs.org/), Git, an Instagram **Business account**, and your own accounts with [Meta for Developers](https://developers.facebook.com/), [Supabase](https://supabase.com/), [Cloudinary](https://cloudinary.com/), and [Vercel](https://vercel.com/). Personal Instagram accounts cannot use this integration. This app also publishes Stories, so use a Business account. See the [account setup guide](REMOTE_DEPLOYMENT.md).

1. Download the project and open its folder:

   ```bash
   git clone https://github.com/GabrielVasilachi/Instagram_Auto.git
   cd Instagram_Auto
   ```

2. Create a Supabase project. In its **SQL Editor**, run the four files in [`supabase/migrations`](supabase/migrations) in filename order.
3. Copy the settings file and fill in **your own** values. In Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

   ```bash
   cp .env.example .env
   npm ci
   npm run dev
   ```

4. Open `http://127.0.0.1:5173` and sign in with the `ADMIN_PASSWORD` from `.env`. Press `Ctrl+C` in the terminal to stop the app.

Keep `.env` private. Do not publish it or use someone else's token without their permission. Set `INSTAGRAM_USERNAME` to your account name without `@`; `BRAND_NAME` is printed on generated media. Before publishing, check that the dashboard shows your account and preview the content. The sample text in [`content/quotes.json`](content/quotes.json) is in English and can be replaced with your own.

Running locally opens the dashboard. Follow [REMOTE_DEPLOYMENT.md](REMOTE_DEPLOYMENT.md) for publishing that runs continuously, and [VIDEO_EDITOR.md](VIDEO_EDITOR.md) for video editing.
