export const DESIGN_OPTIONS = {
  templates: [
    'midnight',
    'aurora',
    'ember',
    'ocean',
    'monochrome',
    'paper',
    'forest',
    'dusk',
    'sandstone',
    'neon',
    'obsidian',
    'meadow',
    'cinematic',
    'concrete',
    'afterglow',
    'signal',
  ],
  fonts: ['sans', 'serif', 'mono'],
  textPositions: ['top', 'center', 'bottom'],
  textAlignments: ['left', 'center', 'right'],
  textCases: ['normal', 'uppercase'],
  animations: ['drift', 'zoom', 'slide', 'pulse', 'float', 'pan', 'breathe', 'static'],
  music: [
    'ambient',
    'deep',
    'focus',
    'pulse',
    'serenity',
    'nostalgia',
    'horizon',
    'starlight',
    'snowfall',
    'silent',
  ],
};

export const DEFAULT_DESIGN = {
  template: 'midnight',
  font: 'sans',
  textPosition: 'center',
  textAlign: 'left',
  fontSize: 76,
  animation: 'drift',
  duration: 8,
  music: 'ambient',
  musicVolume: 55,
  textCase: 'normal',
  letterSpacing: 0,
  lineHeight: 112,
  overlayOpacity: 10,
};

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function numberBetween(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

export function sanitizeText(value, maxLength = 2200) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
      '',
    )
    .replace(/\r\n?/g, '\n')
    .slice(0, maxLength)
    .trim();
}

export function normalizeAccent(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : '#d9ff3f';
}

function normalizeStoryState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = ['pending', 'publishing', 'published', 'failed'].includes(value.status)
    ? value.status
    : null;
  if (!status) return null;
  return {
    status,
    mediaUrl: String(value.mediaUrl ?? '').slice(0, 2000),
    instagramMediaId: String(value.instagramMediaId ?? '').slice(0, 200),
    publishedAt: value.publishedAt ? String(value.publishedAt) : null,
    error: sanitizeText(value.error, 1000),
    retryCount: numberBetween(value.retryCount, 0, 5, 0),
    nextAttemptAt: value.nextAttemptAt ? String(value.nextAttemptAt) : null,
  };
}

function normalizeGrowthState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    version: String(value.version ?? '2026.1').slice(0, 20),
    recipe: sanitizeText(value.recipe, 60),
    pillar: sanitizeText(value.pillar, 40),
    hook: sanitizeText(value.hook, 100),
    cta: sanitizeText(value.cta, 120),
    objective: ['share', 'save', 'retain', 'follow'].includes(value.objective)
      ? value.objective
      : 'share',
    shareabilityScore: numberBetween(value.shareabilityScore, 0, 100, 50),
    selection: value.selection === 'exploit' ? 'exploit' : 'explore',
  };
}

function normalizePerformanceState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    checkedAt: value.checkedAt ? String(value.checkedAt) : null,
    views: numberBetween(value.views, 0, 1_000_000_000, 0),
    reach: numberBetween(value.reach, 0, 1_000_000_000, 0),
    likes: numberBetween(value.likes, 0, 1_000_000_000, 0),
    comments: numberBetween(value.comments, 0, 1_000_000_000, 0),
    shares: numberBetween(value.shares, 0, 1_000_000_000, 0),
    saved: numberBetween(value.saved, 0, 1_000_000_000, 0),
    averageWatchTimeMs: numberBetween(value.averageWatchTimeMs, 0, 3_600_000, 0),
    score: numberBetween(value.score, 0, 100, 50),
    confidence: numberBetween(value.confidence, 0, 100, 0),
  };
}

export function normalizeDesign(value = {}, format = 'post') {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const defaults = {
    ...DEFAULT_DESIGN,
    fontSize: format === 'reel' ? 88 : DEFAULT_DESIGN.fontSize,
  };

  return {
    template: oneOf(input.template, DESIGN_OPTIONS.templates, defaults.template),
    font: oneOf(input.font, DESIGN_OPTIONS.fonts, defaults.font),
    textPosition: oneOf(input.textPosition, DESIGN_OPTIONS.textPositions, defaults.textPosition),
    textAlign: oneOf(input.textAlign, DESIGN_OPTIONS.textAlignments, defaults.textAlign),
    fontSize: numberBetween(input.fontSize, 48, 112, defaults.fontSize),
    animation: oneOf(input.animation, DESIGN_OPTIONS.animations, defaults.animation),
    duration: Math.min(30, Math.max(5, Number(input.duration) || defaults.duration)),
    music: oneOf(input.music, DESIGN_OPTIONS.music, defaults.music),
    musicVolume: numberBetween(input.musicVolume, 0, 100, defaults.musicVolume),
    textCase: oneOf(input.textCase, DESIGN_OPTIONS.textCases, defaults.textCase),
    letterSpacing: numberBetween(input.letterSpacing, -2, 12, defaults.letterSpacing),
    lineHeight: numberBetween(input.lineHeight, 90, 160, defaults.lineHeight),
    overlayOpacity: numberBetween(input.overlayOpacity, 0, 65, defaults.overlayOpacity),
    reelVersion: input.reelVersion === '2026.2' ? '2026.2' : null,
    story: normalizeStoryState(input.story),
    growth: normalizeGrowthState(input.growth),
    performance: normalizePerformanceState(input.performance),
    editorMedia:
      input.editorMedia && typeof input.editorMedia.url === 'string'
        ? {
            url: input.editorMedia.url.slice(0, 2000),
            width: numberBetween(input.editorMedia.width, 1, 4096, 1080),
            height: numberBetween(input.editorMedia.height, 1, 4096, 1920),
            duration: numberBetween(input.editorMedia.duration, 0, 180, 0),
          }
        : null,
  };
}

export function randomizedDesign(cursor = 0, format = 'post') {
  return normalizeDesign(
    {
      template: DESIGN_OPTIONS.templates[cursor % DESIGN_OPTIONS.templates.length],
      font: DESIGN_OPTIONS.fonts[Math.floor(cursor / 2) % DESIGN_OPTIONS.fonts.length],
      textPosition:
        DESIGN_OPTIONS.textPositions[Math.floor(cursor / 3) % DESIGN_OPTIONS.textPositions.length],
      textAlign:
        DESIGN_OPTIONS.textAlignments[
          Math.floor(cursor / 4) % DESIGN_OPTIONS.textAlignments.length
        ],
      fontSize: (format === 'reel' ? 76 : 64) + (cursor % 4) * 8,
      animation: DESIGN_OPTIONS.animations[cursor % DESIGN_OPTIONS.animations.length],
      duration: 7 + (cursor % 5),
      music: DESIGN_OPTIONS.music[cursor % DESIGN_OPTIONS.music.length],
      musicVolume: 42 + (cursor % 4) * 8,
      textCase: DESIGN_OPTIONS.textCases[Math.floor(cursor / 2) % DESIGN_OPTIONS.textCases.length],
      letterSpacing: (cursor % 4) * 2,
      lineHeight: 104 + (cursor % 4) * 6,
      overlayOpacity: 6 + (cursor % 5) * 5,
    },
    format,
  );
}
