export const DESIGN_OPTIONS = {
  templates: ['midnight', 'aurora', 'ember', 'ocean', 'monochrome', 'paper', 'forest', 'dusk', 'sandstone', 'neon', 'obsidian', 'meadow'],
  fonts: ['sans', 'serif', 'mono'],
  textPositions: ['top', 'center', 'bottom'],
  textAlignments: ['left', 'center', 'right'],
  textCases: ['normal', 'uppercase'],
  animations: ['drift', 'zoom', 'slide', 'pulse', 'float', 'pan', 'breathe', 'static'],
  music: ['ambient', 'deep', 'focus', 'pulse', 'serenity', 'nostalgia', 'horizon', 'starlight', 'snowfall', 'silent'],
}

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
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function numberBetween(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
}

export function sanitizeText(value, maxLength = 2200) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .slice(0, maxLength)
    .trim()
}

export function normalizeAccent(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : '#d9ff3f'
}

export function normalizeDesign(value = {}, format = 'post') {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = {
    ...DEFAULT_DESIGN,
    fontSize: format === 'reel' ? 88 : DEFAULT_DESIGN.fontSize,
  }

  return {
    template: oneOf(input.template, DESIGN_OPTIONS.templates, defaults.template),
    font: oneOf(input.font, DESIGN_OPTIONS.fonts, defaults.font),
    textPosition: oneOf(input.textPosition, DESIGN_OPTIONS.textPositions, defaults.textPosition),
    textAlign: oneOf(input.textAlign, DESIGN_OPTIONS.textAlignments, defaults.textAlign),
    fontSize: numberBetween(input.fontSize, 48, 112, defaults.fontSize),
    animation: oneOf(input.animation, DESIGN_OPTIONS.animations, defaults.animation),
    duration: numberBetween(input.duration, 6, 15, defaults.duration),
    music: oneOf(input.music, DESIGN_OPTIONS.music, defaults.music),
    musicVolume: numberBetween(input.musicVolume, 0, 100, defaults.musicVolume),
    textCase: oneOf(input.textCase, DESIGN_OPTIONS.textCases, defaults.textCase),
    letterSpacing: numberBetween(input.letterSpacing, -2, 12, defaults.letterSpacing),
    lineHeight: numberBetween(input.lineHeight, 90, 160, defaults.lineHeight),
    overlayOpacity: numberBetween(input.overlayOpacity, 0, 65, defaults.overlayOpacity),
  }
}

export function randomizedDesign(cursor = 0, format = 'post') {
  return normalizeDesign({
    template: DESIGN_OPTIONS.templates[cursor % DESIGN_OPTIONS.templates.length],
    font: DESIGN_OPTIONS.fonts[Math.floor(cursor / 2) % DESIGN_OPTIONS.fonts.length],
    textPosition: DESIGN_OPTIONS.textPositions[Math.floor(cursor / 3) % DESIGN_OPTIONS.textPositions.length],
    textAlign: DESIGN_OPTIONS.textAlignments[Math.floor(cursor / 4) % DESIGN_OPTIONS.textAlignments.length],
    fontSize: (format === 'reel' ? 76 : 64) + (cursor % 4) * 8,
    animation: DESIGN_OPTIONS.animations[cursor % DESIGN_OPTIONS.animations.length],
    duration: 7 + (cursor % 5),
    music: DESIGN_OPTIONS.music[cursor % DESIGN_OPTIONS.music.length],
    musicVolume: 42 + (cursor % 4) * 8,
    textCase: DESIGN_OPTIONS.textCases[Math.floor(cursor / 2) % DESIGN_OPTIONS.textCases.length],
    letterSpacing: (cursor % 4) * 2,
    lineHeight: 104 + (cursor % 4) * 6,
    overlayOpacity: 6 + (cursor % 5) * 5,
  }, format)
}
