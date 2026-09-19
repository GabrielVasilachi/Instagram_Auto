# Silent Forward Video Editor

Open `/video-editor` after signing in, or select **Video Editor** in the dashboard navigation. The editor is lazy-loaded and has its own layout. The existing dashboard, Reel Studio, and worker remain separate.

## Editing

- Import local MP4/MOV/WebM, PNG/JPG/WebP, MP3/WAV/AAC/M4A. The browser must support the codec. Source files stay in IndexedDB on this device until export. Audio waveforms are sampled from decoded audio, not decorative data; waveform generation is skipped for audio files over 35 MB.
- Double-click media or drag it to the video, overlay, or audio track. Add text in the Text panel. Drag clips to move them; drag either edge to trim. `S` splits the selected clip at the playhead. Clip start and duration can also be edited numerically.
- Preview supports playback, seek, frame stepping, monitor volume/mute, replay, fullscreen, and preview zoom. Monitor volume only affects preview; clip volume affects the exported video.
- Canvas ratios: 9:16, 16:9, 1:1, 4:5. Position, width/height, scale, rotation, opacity, flips, Fit/Fill, and dragging the selected visual in the preview are supported.
- Text uses the bundled Inter, Lora, and JetBrains Mono fonts, with wrapping, weight, alignment, color, background opacity, stroke, shadow, and None/Fade/Slide Up/Slide Left/Pop/Zoom animations. Text size uses a 1080-pixel short-side canvas as its reference.
- Adjustments: brightness, contrast, saturation, exposure, blur, grayscale. Audio: volume, mute, source trim, speed, fade in/out. Video and audio speed: 0.25×–2×.
- Fade applies an entrance and exit fade. Dissolve moves the incoming clip to overlap the previous clip on its track and fades the incoming layer over it. Adjust the overlap by dragging clips. Same-track overlaps are composited by start time. Track visibility/mute is honored by preview and export.
- Undo/Redo, duplicate, delete, snapping, track locks, ruler, thumbnails, timeline zoom, and functional project templates are included. `Space`: play/pause; `Delete`/`Backspace`: delete; `Ctrl/Cmd+D`: duplicate; `Ctrl/Cmd+Z`: undo; `Ctrl/Cmd+Shift+Z`: redo; `Ctrl/Cmd+S`: save; arrow keys: one frame.

The current project and original media are saved in IndexedDB. Refresh restores both. This is device/browser-local recovery, not cross-device backup. Clearing browser site data removes it. New Project asks before clearing the current project and stored source files. Relink restores a missing original by matching its filename and size. Auto Captions can be added later as timed `TextClip` items; there is no inactive speech-to-text control.

## Export architecture

`src/video-editor/` separates project types, pure timeline operations, history/storage, media import, Canvas preview rendering, UI panels, and export transport. `server/video-editor/` contains validation, signed media receipts, bounded uploads/downloads, FFmpeg graph generation, progress streaming, and planner delivery.

1. The authenticated server issues a short-lived signed upload ticket for one source asset in the configured Cloudinary account. Browser uploads use 6 MB chunks directly to Cloudinary, avoiding Vercel's request-body limit. No API secret reaches the browser. Vercel CSP permits only the Cloudinary API/CDN in addition to the existing origins.
2. Upload responses are verified using Cloudinary's signature. The server produces an HMAC receipt bound to the verified asset URL. Text is rasterized to transparent PNG with the same Canvas typography used by preview, then uploaded through the same verified flow.
3. An authenticated export request validates the timeline and all ranges. Only receipt-bound assets can be downloaded. Redirects are rejected; FFmpeg sees local files and restricted input formats/protocols, never arbitrary user-provided URLs or command strings.
4. FFmpeg composes the layers and audio, honoring timing, trim, speed, placement, filters, text animation, and fades. It writes H.264 / yuv420p + AAC MP4 with `faststart`. Progress comes from FFmpeg's progress pipe. A single streaming request stays open through preparation, rendering, and final upload; no in-memory job needs to survive between serverless requests. Disconnect/cancel/deadline aborts rendering and removes temporary render files.
5. The completed MP4 is uploaded to Cloudinary in 10 MB chunks. Download fetches that MP4. If Cloudinary is not configured during local development, authenticated temporary local uploads/downloads are available instead; local export files expire after one day.

720p and 1080p refer to the **short side** (720×1280 and 1080×1920 for vertical video); frame rates 24/30/60, Standard CRF 23 and High CRF 18. Preview uses browser decoding/Canvas while export uses FFmpeg: minor color/antialiasing differences can occur, especially with strong saturation or blur. Slow-motion playback preserves pitch using browser playbackRate and FFmpeg atempo.

## Instagram Planner

After export, **Send to Instagram Planner** accepts caption and a future time in the browser's displayed time zone. Scheduling is an explicit second action; exporting alone never publishes or schedules anything. Reel handoff requires a 9:16 project of at least 3 seconds and configured Cloudinary.

The authenticated endpoint verifies an export receipt, inserts a scheduled manual Reel, and stores the immutable rendered URL in `design.editorMedia` and `media_url`. The export ID makes handoff idempotent. No database migration is required because the existing `design` column is JSONB.

Database normalization preserves `editorMedia`. The existing publisher recognizes that metadata and sends the completed video directly to Instagram, preserving the montage. Preview, duplicate, and caption/schedule edits retain the exported URL. Reel Studio-generated content follows its existing path. Stories continue using the existing promotional Story renderer.

## Runtime and bounds

No new production npm dependencies. Use the existing environment variables in `REMOTE_DEPLOYMENT.md`. Production requires the already-used `CLOUDINARY_*`, authentication, and Supabase configuration. No new secret or paid service was introduced. Source assets are stored in `silent-forward/editor-source/` and exports in `silent-forward/editor-export/`; Cloudinary storage/bandwidth quotas apply. Source uploads are retained in Cloudinary and may be removed manually after the corresponding exports finish; deleting export assets breaks their scheduled/published links.

Bounds: 100 MB per source, 250 MB source media per project/export, 30 imported files, 40 timeline clips, 3-minute timeline, up to 8K input dimensions. The server allows one concurrent render per process and cancels after 265 seconds within the existing 300-second function limit. Heavy 1080p/60 FPS projects can exceed serverless time or memory limits: retry at 720p or reduce duration/layers. A durable render worker is the next step for long-form editing or concurrent users.

Current exclusions: arbitrary crop handles (Fill provides centered crop), keyframes, slide/zoom **transitions between clips**, optical-flow slow motion, speech recognition/auto-captions, cloud project sync, and reuse of generated Silent Forward soundscapes as standalone audio assets. Text entrance animations include slide/pop/zoom and are implemented in both preview and export.

## Validation

`npm run build` checks TypeScript and creates the lazy-loaded editor bundle. `npm test` includes timeline/source-bound tests, hostile/oversized manifest rejection, receipt/signature checks, a real FFmpeg composition test that probes and samples the resulting MP4, and authenticated/idempotent planner-route tests. Tests do not publish to Instagram. Browser smoke testing covers import, timeline editing, playback/seek, text/audio, aspect ratio, refresh recovery, actual export, and MP4 download.

The legacy generated-Reel renderer now limits FFmpeg filter threads, preventing multi-input image-overlay stalls observed during the existing media regression test.
