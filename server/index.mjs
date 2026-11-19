import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expiredSessionCookie,
  isAllowedOrigin,
  issueSession,
  passwordMatches,
  readSessionCookie,
  sessionCookie,
  verifySession,
} from './auth.mjs';
import { cloudinaryConfigured, uploadToCloudinary } from './cloudinary.mjs';
import {
  beginWorkerRun,
  claimPostForPublishing,
  claimWorkerLease,
  deletePost,
  deletePosts,
  finishWorkerRun,
  insertPost,
  insertPosts,
  loadDatabase,
  loadQueueContext,
  loadDueInsightId,
  loadDuePostIds,
  loadDueStoryId,
  loadPost,
  loadSettings,
  loadWorkerState,
  releaseExpiredClaims,
  releaseWorkerLease,
  savePost,
  updateSettings,
} from './database.mjs';
import { captionFor, POST_TIME, POST_WEEKDAYS, REEL_TIMES } from './content-plan.mjs';
import { brandName, brandUsername } from './branding.mjs';
import { DESIGN_OPTIONS, normalizeAccent, normalizeDesign, sanitizeText } from './design.mjs';
import { calculatePerformanceScore, GROWTH_VERSION, growthDesignFor } from './growth-engine.mjs';
import {
  fetchMediaInsights,
  instagramConfigured,
  instagramRequest,
  publishStoryToInstagram,
  publishToInstagram,
} from './instagram.mjs';
import {
  generateAudioPreview,
  generateImage,
  generateMedia,
  generateStoryPromotion,
} from './media.mjs';
import { validateWorkerEnvironment } from './preflight.mjs';
import { isRetryablePublishError, retryDelayMs, withRemoteRetries } from './retry.mjs';
import { scheduledSlots } from './time.mjs';
import { editorRouter } from './video-editor/routes.mjs';
import { REEL_VERSION, planReel, chooseQuote } from './reel-plan.mjs';
import { eligibleForRefresh, refreshScheduledReel } from './refresh-reels.mjs';
import { cacheReelPreview, loadRefreshSnapshot, replaceRefreshedMedia } from './database.mjs';
import { isEditorMediaUrl } from './video-editor/assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDirectory = process.env.VERCEL ? '/tmp/generated' : path.join(root, 'generated');
const quotesFile = path.join(root, 'content', 'quotes.json');
const editorialFile = path.join(root, 'content', 'follower-editions.json');
async function loadQueueQuotes() {
  const [editions, quotes] = await Promise.all([
    readFile(editorialFile, 'utf8').then(JSON.parse),
    readFile(quotesFile, 'utf8').then(JSON.parse),
  ]);
  return [...Object.values(editions).flat().map((beats) => beats.join(' ')), ...quotes];
}
const port = Number(process.env.PORT || process.env.API_PORT || 5174);
const app = express();
const loginAttempts = new Map();
let accountCache = { expiresAt: 0, value: null };

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use((_request, response, next) => {
  response.set({
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

function secureRequest(request) {
  return (
    request.secure || request.get('x-forwarded-proto') === 'https' || Boolean(process.env.VERCEL)
  );
}

function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

function isRemoteMediaUrl(value) {
  return typeof value === 'string' && /^https:\/\/res\.cloudinary\.com\//i.test(value);
}

function authenticated(request) {
  return authConfigured() && verifySession(readSessionCookie(request), process.env.SESSION_SECRET);
}

function requireAuthentication(request, response, next) {
  if (!authConfigured())
    return response.status(503).json({ error: 'Autentificarea nu este configurată pe server.' });
  if (!authenticated(request))
    return response.status(401).json({ error: 'Autentificare necesară.' });
  next();
}

function validateOrigin(request, response, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isAllowedOrigin(request)) {
    return response.status(403).json({ error: 'Originea cererii nu este permisă.' });
  }
  next();
}

function attemptState(request) {
  const key = request.ip || 'unknown';
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + 15 * 60_000 };
    loginAttempts.set(key, fresh);
    return fresh;
  }
  return current;
}

app.get('/api/health', (_request, response) => response.json({ ok: true }));

app.get('/api/auth/session', (request, response) => {
  response.json({ authenticated: authenticated(request), configured: authConfigured() });
});

app.post('/api/auth/login', validateOrigin, (request, response) => {
  if (!authConfigured())
    return response.status(503).json({ error: 'Autentificarea nu este configurată pe server.' });
  const attempts = attemptState(request);
  if (attempts.count >= 8)
    return response
      .status(429)
      .json({ error: 'Prea multe încercări. Reîncearcă peste 15 minute.' });
  if (!passwordMatches(request.body?.password, process.env.ADMIN_PASSWORD)) {
    attempts.count += 1;
    return response.status(401).json({ error: 'Parola nu este corectă.' });
  }
  loginAttempts.delete(request.ip || 'unknown');
  response.setHeader(
    'Set-Cookie',
    sessionCookie(issueSession(process.env.SESSION_SECRET), secureRequest(request)),
  );
  response.json({ authenticated: true });
});

app.post('/api/auth/logout', validateOrigin, (request, response) => {
  response.setHeader('Set-Cookie', expiredSessionCookie(secureRequest(request)));
  response.status(204).end();
});

app.post('/api/worker/run', async (request, response) => {
  if (!process.env.SCHEDULER_SECRET)
    return response.status(503).json({ error: 'Workerul programat nu este configurat.' });
  if (!passwordMatches(request.get('x-scheduler-secret'), process.env.SCHEDULER_SECRET)) {
    return response.status(401).json({ error: 'Autorizare worker invalidă.' });
  }
  try {
    response.json(await runRemoteWorker({
      source: 'supabase-cron',
      scheduler: true,
      maintenance: request.body?.maintenance === true,
    }));
  } catch (error) {
    console.error('[worker]', error instanceof Error ? error.message : error);
    response.status(500).json({ error: 'Rularea automată nu a putut fi finalizată.' });
  }
});

app.use('/api', requireAuthentication, validateOrigin);
app.get('/api/soundscapes/:music/preview', async (request, response) => {
  const music = request.params.music;
  if (!DESIGN_OPTIONS.music.includes(music) || music === 'silent')
    return response.status(400).json({ error: 'Selectează un soundscape cu audio.' });
  const audio = await generateAudioPreview(music, mediaDirectory);
  response.set('Cache-Control', 'private, max-age=86400').type('audio/mp4').send(audio);
});

app.use('/api/video-editor', editorRouter({ insertPost, loadPost }));

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''));
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizePostInput(body, existing = null) {
  const format = ['post', 'reel'].includes(body.format)
    ? body.format
    : (existing?.format ?? 'post');
  const quote = sanitizeText(body.quote ?? existing?.quote, 220);
  const caption = sanitizeText(body.caption ?? existing?.caption, 2200);
  const date = new Date(body.scheduledFor ?? existing?.scheduledFor);
  if (!quote || Number.isNaN(date.getTime()))
    throw new Error('Completează mesajul și o dată validă.');
  return {
    ...(existing ?? {}),
    quote,
    caption,
    accent: normalizeAccent(body.accent ?? existing?.accent),
    format,
    scheduledFor: date.toISOString(),
    design: {
      ...normalizeDesign(body.design ?? existing?.design, format),
      editorMedia: existing?.design?.editorMedia ?? null,
    },
  };
}

async function profile() {
  if (accountCache.value && accountCache.expiresAt > Date.now()) return accountCache.value;
  let value = { connected: false, username: brandUsername, accountType: 'BUSINESS' };
  if (process.env.INSTAGRAM_ACCESS_TOKEN) {
    try {
      const remote = await instagramRequest('me', {
        parameters: { fields: 'user_id,username,account_type' },
      });
      value = { connected: true, username: remote.username, accountType: remote.account_type };
    } catch {
      // The queue remains available when Instagram profile lookup is temporarily unavailable.
    }
  }
  accountCache = { value, expiresAt: Date.now() + 10 * 60_000 };
  return value;
}

app.get('/api/dashboard', async (_request, response) => {
  const [database, account, workerState] = await Promise.all([
    loadDatabase(),
    profile(),
    loadWorkerState(),
  ]);
  response.json({
    account,
    branding: { name: brandName, username: brandUsername },
    publishingReady: cloudinaryConfigured() && instagramConfigured(),
    automation: {
      configured: Boolean(process.env.SCHEDULER_SECRET),
      lastRun: workerState,
    },
    settings: database.settings,
    designOptions: DESIGN_OPTIONS,
    contentPlan: {
      reelsPerDay: REEL_TIMES.length,
      reelTimes: REEL_TIMES,
      postsPerWeek: POST_WEEKDAYS.length,
      postWeekdays: POST_WEEKDAYS,
      storyAfterEveryPublication: true,
      growthStrategy: GROWTH_VERSION,
    },
    posts: database.posts,
    stats: {
      scheduled: database.posts.filter((post) => post.status === 'scheduled').length,
      published: database.posts.filter((post) => post.status === 'published').length,
      failed: database.posts.filter((post) => post.status === 'failed').length,
      storiesPublished: database.posts.filter((post) => post.design?.story?.status === 'published')
        .length,
      storiesFailed: database.posts.filter((post) => post.design?.story?.status === 'failed')
        .length,
      insightsCollected: database.posts.filter((post) => post.design?.performance?.checkedAt)
        .length,
      averageGrowthScore: Math.round(
        database.posts.reduce((sum, post) => sum + (post.design?.performance?.score || 0), 0) /
          Math.max(1, database.posts.filter((post) => post.design?.performance?.score).length),
      ),
    },
  });
});

app.get('/api/quotes/random', async (request, response) => {
  const quotes = JSON.parse(await readFile(quotesFile, 'utf8'));
  const count = Math.min(8, Math.max(1, Number(request.query.count) || 1));
  const start = Math.floor(Math.random() * quotes.length);
  response.json(
    Array.from({ length: count }, (_value, index) => quotes[(start + index) % quotes.length]),
  );
});

app.get('/api/ideas/random', async (request, response) => {
  const [quotes, database] = await Promise.all([
    readFile(quotesFile, 'utf8').then(JSON.parse),
    loadDatabase(),
  ]);
  const format = request.query.format === 'post' ? 'post' : 'reel';
  const cursor = Math.floor(Math.random() * quotes.length);
  const quote = chooseQuote(quotes, cursor, database.posts);
  const design = growthDesignFor(quote, format, cursor, database.posts);
  response.json({
    quote,
    caption: captionFor(quote, format, cursor, design.growth),
    accent: ['#d9ff3f', '#ff5c35', '#62e6ff', '#d8a7ff', '#ffcf5c', '#71f6a5', '#ff7eb6'][
      cursor % 7
    ],
    design,
  });
});

app.post('/api/posts', async (request, response) => {
  try {
    const values = normalizePostInput(request.body);
    if (values.format === 'reel')
      values.design.duration = planReel(values.quote, values.design).duration;
    const post = await insertPost({
      id: randomUUID(),
      ...values,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      autoGenerated: false,
      retryCount: 0,
      nextAttemptAt: null,
    });
    response.status(201).json(post);
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Postarea nu a putut fi creată.' });
  }
});

app.patch('/api/posts/:id', async (request, response) => {
  const existing = await loadPost(request.params.id);
  if (!existing) return response.status(404).json({ error: 'Postarea nu există.' });
  if (['published', 'publishing'].includes(existing.status))
    return response
      .status(409)
      .json({ error: 'O postare publicată sau în curs de publicare nu mai poate fi editată.' });
  try {
    const updated = normalizePostInput(request.body, existing);
    if (updated.format === 'reel' && !existing.design?.editorMedia)
      updated.design.duration = planReel(updated.quote, updated.design).duration;
    updated.design.reelVersion = null;
    if (existing.design?.editorMedia && updated.format !== 'reel')
      throw new Error('Un video exportat trebuie păstrat ca Reel.');
    response.json(
      await savePost({
        ...updated,
        status: 'scheduled',
        error: '',
        autoGenerated: false,
        mediaUrl: existing.design?.editorMedia?.url || null,
        retryCount: 0,
        nextAttemptAt: null,
      }),
    );
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Postarea nu a putut fi actualizată.',
    });
  }
});

app.post('/api/posts/:id/duplicate', async (request, response) => {
  const existing = await loadPost(request.params.id);
  if (!existing) return response.status(404).json({ error: 'Postarea nu există.' });
  const scheduledFor =
    request.body?.scheduledFor ||
    new Date(
      Math.max(Date.now() + 3_600_000, new Date(existing.scheduledFor).getTime() + 86_400_000),
    ).toISOString();
  const duplicate = await insertPost({
    ...existing,
    id: randomUUID(),
    scheduledFor,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    autoGenerated: false,
    mediaUrl: existing.design?.editorMedia?.url || null,
    instagramMediaId: null,
    publishedAt: null,
    error: '',
    retryCount: 0,
    nextAttemptAt: null,
  });
  response.status(201).json(duplicate);
});

const previewRenders = new Map();

async function renderReelPreview(snapshot) {
  const { post } = snapshot;
  const key = createHash('sha256')
    .update(JSON.stringify([REEL_VERSION, post.id, post.quote, post.accent, post.design]))
    .digest('hex').slice(0, 16);
  const uploadPost = { ...post, id: `${post.id}-preview-${key}` };
  if (!previewRenders.has(key)) {
    const render = (async () => {
      const filePath = await generateMedia(
        { ...uploadPost, id: `${uploadPost.id}-${randomUUID()}` }, mediaDirectory,
      );
      try {
        const mediaUrl = await uploadToCloudinary(filePath, uploadPost);
        if (['scheduled', 'failed'].includes(post.status)) {
          // Only the original version can acquire the cached URL. Never overwrite an edit or claim.
          await cacheReelPreview(snapshot, mediaUrl, REEL_VERSION).catch((error) =>
            console.warn('[preview-cache]', error.message),
          );
        }
        return mediaUrl;
      } finally {
        await unlink(filePath).catch(() => {});
      }
    })().finally(() => previewRenders.delete(key));
    previewRenders.set(key, render);
  }
  return previewRenders.get(key);
}

app.post('/api/posts/:id/preview', async (request, response) => {
  const snapshot = await loadRefreshSnapshot(request.params.id);
  if (!snapshot) return response.status(404).json({ error: 'Postarea nu există.' });
  const { post } = snapshot;
  if (post.design?.editorMedia) {
    if (!isEditorMediaUrl(post.design.editorMedia.url))
      return response.status(400).json({ error: 'Fișierul Video Editor nu mai este disponibil.' });
    return response.json({ ...post, mediaUrl: post.design.editorMedia.url });
  }
  let mediaUrl = post.mediaUrl;
  if (!isRemoteMediaUrl(mediaUrl)) {
    if (post.format === 'reel' && cloudinaryConfigured()) {
      try {
        mediaUrl = await renderReelPreview(snapshot);
      } catch (error) {
        console.error('[preview-render]', error.message);
        return response.status(502).json({ error: 'Randarea video sau încărcarea fișierului a eșuat.' });
      }
    } else {
      mediaUrl = `/api/posts/${post.id}/media?v=${Date.now()}`;
    }
  }
  response.json({ ...post, mediaUrl });
});

app.get('/api/posts/:id/media', async (request, response) => {
  const post = await loadPost(request.params.id);
  if (!post) return response.status(404).json({ error: 'Postarea nu există.' });
  if (post.design?.editorMedia && isEditorMediaUrl(post.design.editorMedia.url))
    return response.redirect(post.design.editorMedia.url);
  await mkdir(mediaDirectory, { recursive: true });
  const previewPost = { ...post, id: `${post.id}-preview-${Date.now()}` };
  const filePath =
    post.format === 'reel'
      ? await generateMedia(previewPost, mediaDirectory)
      : await generateImage(previewPost, path.join(mediaDirectory, `${previewPost.id}.png`));
  response.type(post.format === 'reel' ? 'video/mp4' : 'image/png');
  response.sendFile(filePath, () => unlink(filePath).catch(() => {}));
});

async function fillQueue() {
  const settings = await loadSettings();
  if (!settings.autopilot) return [];
  const database = await loadQueueContext(settings);
  const quotes = await loadQueueQuotes();
  const additions = [];
  let cursor = database.quoteCursor;

  const occupied = new Set(database.occupied);
  const plans = [
    {
      format: 'reel',
      slots: scheduledSlots({
        times: REEL_TIMES,
        timeZone: database.settings.timezone,
        days: database.settings.queueDays,
      }),
    },
    {
      format: 'post',
      slots: scheduledSlots({
        times: [database.settings.postTime || POST_TIME],
        weekdays: POST_WEEKDAYS,
        timeZone: database.settings.timezone,
        days: database.settings.queueDays,
      }),
    },
  ];

  for (const plan of plans) {
    for (const nextSlot of plan.slots) {
      const slotKey = `${plan.format}:${nextSlot.toISOString().slice(0, 16)}`;
      if (occupied.has(slotKey)) continue;
      const quote = chooseQuote(quotes, cursor, [...database.posts, ...additions]);
      const design = growthDesignFor(quote, plan.format, cursor, [...database.posts, ...additions]);
      additions.push({
        id: randomUUID(),
        quote,
        caption: captionFor(quote, plan.format, cursor, design.growth),
        accent: '#c8c4b8',
        format: plan.format,
        status: 'scheduled',
        scheduledFor: nextSlot.toISOString(),
        createdAt: new Date().toISOString(),
        autoGenerated: true,
        design,
        retryCount: 0,
        nextAttemptAt: null,
      });
      occupied.add(slotKey);
      cursor += 1;
    }
  }

  if (additions.length) {
    await insertPosts(additions);
    await updateSettings({ ...database.settings, schemaVersion: 3 }, cursor);
  }
  return additions;
}

async function refreshOneReel(id, database) {
  if (!cloudinaryConfigured())
    throw new Error('Cloudinary must be configured before refreshing scheduled media.');
  return refreshScheduledReel(id, {
    snapshot: loadRefreshSnapshot,
    replace: replaceRefreshedMedia,
    generate: generateMedia,
    upload: uploadToCloudinary,
    directory: mediaDirectory,
    quotes: JSON.parse(await readFile(quotesFile, 'utf8')),
    history: database.posts,
  });
}

app.post('/api/queue/refresh-reels', async (request, response) => {
  const database = await loadDatabase();
  const ids = database.posts.filter((post) => eligibleForRefresh(post)).map((post) => post.id);
  if (!request.body?.id) return response.json({ ids });
  if (!ids.includes(request.body.id))
    return response.status(409).json({ error: 'Postarea nu mai este eligibilă.' });
  response.json(await refreshOneReel(request.body.id, database));
});

app.post('/api/queue/rebuild', async (_request, response) => {
  const owner = randomUUID();
  const acquired = await claimWorkerLease('instagram-publisher', owner, 240);
  if (!acquired) {
    return response
      .status(409)
      .json({ error: 'Workerul publică sau completează coada. Reîncearcă în câteva secunde.' });
  }

  try {
    const database = await loadDatabase();
    const removable = database.posts
      .filter((post) => post.status === 'scheduled' && post.autoGenerated)
      .map((post) => post.id);
    await deletePosts(removable);
    const additions = await fillQueue();
    response.json({ removed: removable.length, created: additions.length });
  } finally {
    await releaseWorkerLease('instagram-publisher', owner).catch((error) =>
      console.error('[queue-lease]', error instanceof Error ? error.message : error),
    );
  }
});

app.post('/api/insights/refresh', async (request, response) => {
  const owner = randomUUID();
  const acquired = await claimWorkerLease('instagram-publisher', owner, 120);
  if (!acquired)
    return response
      .status(409)
      .json({ error: 'Workerul rulează deja. Reîncearcă în câteva secunde.' });

  try {
    const count = Math.min(5, Math.max(1, Number(request.body?.count) || 1));
    const insights = [];
    for (let index = 0; index < count; index += 1) {
      const insight = await collectNextMediaInsight();
      if (!insight) break;
      insights.push(insight);
    }
    response.json({ collected: insights.length, insights });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Insights nu au putut fi actualizate.',
    });
  } finally {
    await releaseWorkerLease('instagram-publisher', owner).catch((error) =>
      console.error('[insights-lease]', error instanceof Error ? error.message : error),
    );
  }
});

async function verifyInstagramPublisher() {
  try {
    await instagramRequest('me', { parameters: { fields: 'user_id' } });
  } catch (error) {
    if ([190, 102].includes(error.code)) {
      throw new Error('Instagram: autentificare expirată sau invalidă. Actualizează tokenul.', { cause: error });
    }
    throw error;
  }
}

async function publishPost(postId, verified = false) {
  const existing = await loadPost(postId);
  if (!existing) throw new Error('Postarea nu există.');
  if (existing.status === 'published') return existing;
  if (!verified) await verifyInstagramPublisher();
  let post = await claimPostForPublishing(postId);
  if (!post) throw new Error('Postarea este deja procesată de un alt job.');
  const attempt = (post.retryCount ?? 0) + 1;
  let filePath;
  let result;
  let confirmed = false;
  try {
    await mkdir(mediaDirectory, { recursive: true });
    let publicUrl;
    if (post.design?.editorMedia) {
      if (!isEditorMediaUrl(post.design.editorMedia.url))
        throw new Error('Fișierul Video Editor nu este valid. Exportă din nou proiectul.');
      publicUrl = post.design.editorMedia.url;
    } else if (post.design?.reelVersion === REEL_VERSION && isRemoteMediaUrl(post.mediaUrl)) {
      publicUrl = post.mediaUrl;
    } else {
      filePath = await generateMedia(post, mediaDirectory);
      publicUrl = await uploadToCloudinary(filePath, post);
      post = await savePost({ ...post, mediaUrl: publicUrl, design: { ...post.design, reelVersion: REEL_VERSION } });
    }
    const published = await publishToInstagram(post, publicUrl);
    confirmed = true;
    result = await savePost({
      ...post,
      status: 'published',
      mediaUrl: publicUrl,
      instagramMediaId: published.id,
      publishedAt: new Date().toISOString(),
      design: {
        ...post.design,
        story: { status: 'pending', retryCount: 0, nextAttemptAt: null },
      },
      error: '',
      retryCount: 0,
      nextAttemptAt: null,
    });
  } catch (error) {
    if (confirmed) throw error; // Leave the claim for reconciliation if the final database write failed.
    const message = error instanceof Error ? error.message : 'Publicarea a eșuat.';
    const authExpired = [190, 102].includes(error.code);
    const canRetry = authExpired || (isRetryablePublishError(error) && attempt < 5);
    await savePost({
      ...post,
      status: canRetry ? 'scheduled' : 'failed',
      error: message,
      retryCount: authExpired ? attempt - 1 : attempt,
      nextAttemptAt: canRetry ? new Date(Date.now() + (authExpired ? 15 * 60_000 : retryDelayMs(attempt))).toISOString() : null,
    });
    throw error;
  } finally {
    if (filePath) await unlink(filePath).catch(() => {});
  }

  return result;
}

async function publishStoryPromotion(post) {
  const current = post.design?.story;
  if (current?.status === 'published') return post;
  if (current?.status === 'publishing') {
    const error = 'Confirmarea Story lipsește. Verifică Instagram înainte de reîncercare.';
    if (Date.parse(current.nextAttemptAt) <= Date.now())
      await savePost({ ...post, design: { ...post.design, story: {
        ...current, status: 'failed', error, retryCount: 5, nextAttemptAt: null,
      } } });
    throw new Error(error);
  }
  const attempt = (current?.retryCount ?? 0) + 1;
  const leaseUntil = new Date(Date.now() + 15 * 60_000).toISOString();
  let filePath;
  let confirmed = false;

  const publishing = await savePost({
    ...post,
    design: {
      ...post.design,
      story: {
        ...current,
        status: 'publishing',
        error: '',
        retryCount: attempt,
        nextAttemptAt: leaseUntil,
      },
    },
  });

  try {
    await mkdir(mediaDirectory, { recursive: true });
    const promotion = await generateStoryPromotion(publishing, mediaDirectory);
    filePath = promotion.filePath;
    const publicUrl = await uploadToCloudinary(filePath, promotion.uploadPost);
    const published = await publishStoryToInstagram(publicUrl);
    confirmed = true;
    return await savePost({
      ...publishing,
      design: {
        ...publishing.design,
        story: {
          status: 'published',
          mediaUrl: publicUrl,
          instagramMediaId: published.id,
          publishedAt: new Date().toISOString(),
          error: '',
          retryCount: attempt,
          nextAttemptAt: null,
        },
      },
    });
  } catch (error) {
    if (confirmed) throw error;
    const message = error instanceof Error ? error.message : 'Story-ul nu a putut fi publicat.';
    const retry = isRetryablePublishError(error) && attempt < 5;
    await savePost({
      ...publishing,
      design: {
        ...publishing.design,
        story: {
          ...publishing.design.story,
          status: 'failed',
          error: message,
          retryCount: retry ? attempt : 5,
          nextAttemptAt: retry ? new Date(Date.now() + retryDelayMs(attempt)).toISOString() : null,
        },
      },
    });
    throw error;
  } finally {
    if (filePath) await unlink(filePath).catch(() => {});
  }
}

async function publishDueStories(limit = 1) {
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const id = await loadDueStoryId();
    if (!id) break;
    const post = await loadPost(id);
    if (!post) continue;
    try {
      const published = await publishStoryPromotion(post);
      results.push({
        id: post.id,
        status: published.design.story.status,
        instagramMediaId: published.design.story.instagramMediaId,
      });
    } catch (error) {
      results.push({
        id: post.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

async function collectNextMediaInsight() {
  const id = await loadDueInsightId();
  const candidate = id ? await loadPost(id) : null;
  if (!candidate) return null;
  const metrics = await fetchMediaInsights(candidate);
  const rating = calculatePerformanceScore(candidate, metrics);
  const checkedAt = new Date().toISOString();
  await savePost({
    ...candidate,
    design: {
      ...candidate.design,
      performance: { ...metrics, ...rating, checkedAt },
    },
  });
  return {
    id: candidate.id,
    format: candidate.format,
    recipe: candidate.design?.growth?.recipe || null,
    ...metrics,
    ...rating,
    checkedAt,
  };
}

app.post('/api/posts/:id/publish', async (request, response) => {
  const owner = randomUUID();
  if (!await claimWorkerLease('instagram-publisher', owner, 330))
    return response.status(409).json({ error: 'Workerul publică deja. Încearcă din nou.' });
  try {
    response.json(await publishPost(request.params.id));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Publicarea a eșuat.' });
  } finally {
    await releaseWorkerLease('instagram-publisher', owner).catch((error) =>
      console.error('[publisher-lease]', error.message),
    );
  }
});

app.post('/api/posts/:id/story/publish', async (request, response) => {
  const owner = randomUUID();
  const acquired = await claimWorkerLease('instagram-publisher', owner, 240);
  if (!acquired)
    return response
      .status(409)
      .json({ error: 'Workerul publică deja. Reîncearcă în câteva secunde.' });
  try {
    const post = await loadPost(request.params.id);
    if (!post) return response.status(404).json({ error: 'Postarea nu există.' });
    if (post.status !== 'published')
      return response
        .status(409)
        .json({ error: 'Story-ul promo poate fi creat după publicarea materialului principal.' });
    response.json(await publishStoryPromotion(post));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Story-ul nu a putut fi publicat.' });
  } finally {
    await releaseWorkerLease('instagram-publisher', owner).catch((error) =>
      console.error('[story-lease]', error instanceof Error ? error.message : error),
    );
  }
});

app.delete('/api/posts/:id', async (request, response) => {
  const post = await loadPost(request.params.id);
  if (!post) return response.status(404).json({ error: 'Postarea nu există.' });
  if (['published', 'publishing'].includes(post.status))
    return response
      .status(409)
      .json({ error: 'Istoricul unei postări publicate nu poate fi șters din dashboard.' });
  await deletePost(post.id);
  response.status(204).end();
});

app.patch('/api/settings', async (request, response) => {
  const database = await loadDatabase();
  const settings = { ...database.settings };
  if ('autopilot' in request.body) settings.autopilot = Boolean(request.body.autopilot);
  if ('postTime' in request.body) {
    if (!validTime(request.body.postTime))
      return response.status(400).json({ error: 'Ora postării nu este validă.' });
    settings.postTime = request.body.postTime;
  }
  if ('reelTime' in request.body) {
    if (!validTime(request.body.reelTime))
      return response.status(400).json({ error: 'Ora Reel-ului nu este validă.' });
    settings.reelTime = request.body.reelTime;
  }
  if ('timezone' in request.body) {
    if (!validTimezone(request.body.timezone))
      return response.status(400).json({ error: 'Fusul orar nu este valid.' });
    settings.timezone = request.body.timezone;
  }
  if ('queueDays' in request.body)
    settings.queueDays = Math.min(
      30,
      Math.max(3, Number(request.body.queueDays) || settings.queueDays),
    );
  const updated = await updateSettings({ ...settings, schemaVersion: 3 });
  if (updated.autopilot) await fillQueue();
  response.json(updated);
});

async function publishDuePosts(limit = 1) {
  await releaseExpiredClaims();
  const settings = await loadSettings();
  if (!settings.autopilot) return [];
  const due = await loadDuePostIds(new Date(), limit);
  if (due.length) await verifyInstagramPublisher();
  const results = [];
  const errors = [];
  for (const id of due) {
    try {
      console.log(`[publisher] Publicăm ${id}`);
      results.push(await publishPost(id, true));
      console.log(`[publisher] Publicare finalizată: ${id}`);
    } catch (error) {
      errors.push(error);
      console.error(`[publisher] ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!due.length) console.log('[publisher] Nu există postări scadente.');
  if (errors.length) throw errors[0];
  return results;
}

async function runRemoteWorker(options = {}) {
  validateWorkerEnvironment(process.env, { scheduler: Boolean(options.scheduler) });
  const source = options.source || 'manual';
  const runId = randomUUID();
  const checkedAt = new Date().toISOString();
  const acquired = await claimWorkerLease('instagram-publisher', runId, 330);
  if (!acquired) {
    return {
      ok: true,
      skipped: true,
      reason: 'worker-already-running',
      checkedAt,
      queueAdditions: 0,
      published: [],
    };
  }

  let runStarted = false;
  try {
    await beginWorkerRun(runId, source);
    runStarted = true;
    const published = await publishDuePosts(1);
    const stories = [];
    let additions = [];
    if (!published.length) {
      if (await loadDueStoryId()) {
        await verifyInstagramPublisher();
        stories.push(...await publishDueStories(1));
      } else if (options.maintenance !== false) {
        additions = await fillQueue();
      }
    }
    let insight = null;
    try {
      if (options.maintenance !== false && !published.length && !stories.length) insight = await collectNextMediaInsight();
    } catch (error) {
      console.warn(`[insights] ${error instanceof Error ? error.message : error}`);
    }
    const result = {
      ok: true,
      skipped: false,
      checkedAt,
      queueAdditions: additions.length,
      published: published.map((post) => ({
        id: post.id,
        format: post.format,
        instagramMediaId: post.instagramMediaId,
      })),
      stories,
      insight,
    };
    await finishWorkerRun(runId, {
      status: 'succeeded',
      result,
      maintenance: options.maintenance !== false && !published.length && !stories.length,
    });
    return result;
  } catch (error) {
    if (runStarted) {
      await finishWorkerRun(runId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        result: { checkedAt },
      }).catch((stateError) =>
        console.error(
          '[worker-state]',
          stateError instanceof Error ? stateError.message : stateError,
        ),
      );
    }
    throw error;
  } finally {
    await releaseWorkerLease('instagram-publisher', runId).catch((error) =>
      console.error('[worker-lease]', error instanceof Error ? error.message : error),
    );
  }
}

app.use((error, _request, response, _next) => {
  console.error('[api]', error instanceof Error ? error.message : error);
  response.status(500).json({ error: 'Serverul a întâmpinat o eroare. Încearcă din nou.' });
});

await mkdir(mediaDirectory, { recursive: true });

if (process.env.REFRESH_REELS === 'true') {
  const database = await loadDatabase();
  const candidates = database.posts.filter(
    (post) => eligibleForRefresh(post) && post.design?.reelVersion !== REEL_VERSION,
  );
  let refreshed = 0,
    failed = 0;
  for (const post of candidates) {
    try {
      const result = await refreshOneReel(post.id, await loadDatabase());
      if (result.status === 'refreshed') refreshed++;
      else failed++;
      console.log(JSON.stringify(result));
    } catch (error) {
      failed++;
      console.error(JSON.stringify({ id: post.id, status: 'failed', error: error.message }));
    }
  }
  console.log(JSON.stringify({ refreshed, failed, candidates: candidates.length }));
  process.exit(failed ? 1 : 0);
}

if (process.env.RUN_ONCE === 'true') {
  await withRemoteRetries(() => runRemoteWorker({ source: 'github-manual' }), {
    attempts: 5,
    baseDelayMs: 15_000,
    onRetry: ({ attempt, delayMs, error }) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[publisher] Serviciu remote indisponibil temporar (${message}). Reîncercarea ${attempt + 1}/5 începe în ${Math.round(delayMs / 1000)}s.`,
      );
    },
  });
  process.exit(0);
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  if (process.env.ENABLE_LOCAL_WORKER === 'true') {
    await fillQueue();
    cron.schedule(
      '* * * * *',
      () => runRemoteWorker({ source: 'local', maintenance: false }).catch((error) => console.error(`[scheduler] ${error.message}`)),
      { timezone: 'Europe/Chisinau' },
    );
    cron.schedule(
      '5 * * * *',
      () => fillQueue().catch((error) => console.error(`[queue] ${error.message}`)),
      { timezone: 'Europe/Chisinau' },
    );
    console.log('[local] Workerul local este activat explicit.');
  } else {
    console.log('[local] Workerul local este oprit; Supabase continuă automatizarea remote.');
  }
  app.listen(port, '0.0.0.0', () => console.log(`Silent Forward API: http://0.0.0.0:${port}`));
}

export {
  collectNextMediaInsight,
  fillQueue,
  publishDuePosts,
  publishDueStories,
  publishPost,
  publishStoryPromotion,
  runRemoteWorker,
};
export default app;
