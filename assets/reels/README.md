# Optional cinematic footage and music

The engine works without external services: dark animated backgrounds and original synthesized soundscapes are the default. No stock footage or third-party music is bundled. No API key, subscription, or card is needed.

To use licensed footage/music, place files here and add entries to `manifest.json`:

```json
{"assets":[{"file":"night-rain.mp4","kind":"video","moods":["silence","pain"],"license":"Your verified license identifier","source":"Original source URL or owner","commercialUse":true,"attributionRequired":false}]}
```

`kind` is `video` or `audio`; moods: discipline, silence, ambition, pain, comeback, self-respect. Only local files inside this folder are accepted. Verify the actual license covers automated commercial Instagram distribution before setting the flags; metadata is not itself permission. Entries requiring attribution are excluded. Files are selected deterministically by message within the matching mood. Obsidian always retains the silent-black background. An explicitly silent audio setting remains silent.

The Settings button regenerates future scheduled generated Reels one at a time. The CLI `REFRESH_REELS=true node server/index.mjs` only upgrades old engine versions and never publishes. Both require existing Supabase and Cloudinary credentials. Refresh renders, decodes both streams, uploads under a unique name, then atomically replaces the reference if the post is still unchanged, future and scheduled. Existing cloud media is retained to avoid breaking references; losing a concurrent race may leave an unreferenced upload for later manual cleanup.
