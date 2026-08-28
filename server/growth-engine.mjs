import { normalizeDesign, sanitizeText } from './design.mjs'

export const GROWTH_VERSION = '2026.1'

export const GROWTH_RECIPES = [
  { key: 'noir-impact', template: 'midnight', font: 'sans', textPosition: 'center', textAlign: 'left', fontSize: 92, animation: 'drift', duration: 8, music: 'focus', musicVolume: 42, letterSpacing: 0, lineHeight: 106, overlayOpacity: 12 },
  { key: 'mono-pulse', template: 'monochrome', font: 'sans', textPosition: 'center', textAlign: 'left', fontSize: 94, animation: 'zoom', duration: 7, music: 'deep', musicVolume: 40, letterSpacing: 0, lineHeight: 104, overlayOpacity: 8 },
  { key: 'editorial-calm', template: 'paper', font: 'serif', textPosition: 'center', textAlign: 'left', fontSize: 78, animation: 'pan', duration: 8, music: 'nostalgia', musicVolume: 36, letterSpacing: 0, lineHeight: 112, overlayOpacity: 3 },
  { key: 'cinema-focus', template: 'cinematic', font: 'sans', textPosition: 'center', textAlign: 'left', fontSize: 90, animation: 'breathe', duration: 8, music: 'horizon', musicVolume: 40, letterSpacing: 1, lineHeight: 106, overlayOpacity: 14 },
  { key: 'blue-hour', template: 'ocean', font: 'serif', textPosition: 'center', textAlign: 'center', fontSize: 80, animation: 'float', duration: 8, music: 'serenity', musicVolume: 38, letterSpacing: 0, lineHeight: 112, overlayOpacity: 10 },
  { key: 'quiet-green', template: 'forest', font: 'sans', textPosition: 'bottom', textAlign: 'left', fontSize: 84, animation: 'pan', duration: 8, music: 'focus', musicVolume: 38, letterSpacing: 1, lineHeight: 108, overlayOpacity: 12 },
  { key: 'concrete-rule', template: 'concrete', font: 'mono', textPosition: 'center', textAlign: 'left', fontSize: 72, animation: 'slide', duration: 7, music: 'deep', musicVolume: 42, letterSpacing: 1, lineHeight: 112, overlayOpacity: 9 },
  { key: 'afterglow', template: 'afterglow', font: 'serif', textPosition: 'center', textAlign: 'left', fontSize: 82, animation: 'float', duration: 8, music: 'starlight', musicVolume: 36, letterSpacing: 0, lineHeight: 110, overlayOpacity: 10 },
  { key: 'clean-signal', template: 'signal', font: 'sans', textPosition: 'center', textAlign: 'left', fontSize: 92, animation: 'pulse', duration: 7, music: 'pulse', musicVolume: 36, letterSpacing: 0, lineHeight: 104, overlayOpacity: 13 },
  { key: 'soft-dusk', template: 'dusk', font: 'serif', textPosition: 'center', textAlign: 'center', fontSize: 80, animation: 'breathe', duration: 8, music: 'snowfall', musicVolume: 35, letterSpacing: 0, lineHeight: 112, overlayOpacity: 12 },
]

const pillarRules = [
  ['discipline', /disciplin|habit|standard|promise|consistent|routine/i],
  ['focus', /focus|attention|distraction|deep work|noise|priority/i],
  ['resilience', /fail|fall|pain|hard|storm|quit|setback|delayed|denied/i],
  ['self-respect', /respect|worth|boundary|choose yourself|approval/i],
  ['courage', /fear|courage|brave|risk|afraid|comfort/i],
  ['growth', /grow|progress|better|future|change|learn|become/i],
  ['quiet-confidence', /quiet|silence|confidence|applause|prove/i],
  ['purpose', /purpose|direction|meaning|mission|why/i],
]

const hooks = {
  discipline: ['READ THIS WHEN MOTIVATION DISAPPEARS', 'YOUR STANDARD MATTERS MORE THAN YOUR MOOD'],
  focus: ['YOUR ATTENTION IS BUILDING YOUR FUTURE', 'IF YOU FEEL DISTRACTED, READ THIS'],
  resilience: ['FOR THE DAYS THAT FEEL TOO HEAVY', 'READ THIS BEFORE YOU DECIDE TO QUIT'],
  'self-respect': ['STOP NEGOTIATING WITH YOUR OWN WORTH', 'THIS IS YOUR REMINDER TO CHOOSE YOURSELF'],
  courage: ['FEAR IS NOT A STOP SIGN', 'THE NEXT STEP DOES NOT NEED PERMISSION'],
  growth: ['YOUR PROGRESS MAY BE QUIETER THAN YOU THINK', 'THE RESULT IS HIDING INSIDE THE REPETITION'],
  'quiet-confidence': ['YOU DO NOT NEED TO ANNOUNCE THE WORK', 'LET THE RESULT MAKE THE NOISE'],
  purpose: ['MOVE WITH DIRECTION, NOT PRESSURE', 'REMEMBER WHAT YOU ARE BUILDING'],
}

const ctas = {
  share: ['SEND THIS TO SOMEONE BUILDING QUIETLY', 'SHARE THIS WITH THE PERSON WHO NEEDS IT TODAY'],
  save: ['SAVE THIS FOR THE DAY YOUR FOCUS GETS TESTED', 'KEEP THIS CLOSE FOR THE HARD DAYS'],
  retain: ['READ IT AGAIN. THE SECOND TIME HITS DIFFERENT', 'PAUSE HERE. LET THE MESSAGE LAND'],
  follow: ['FOLLOW @SILENTFORWARD FOR TOMORROW’S RESET', 'BUILD QUIETLY WITH @SILENTFORWARD'],
}

export function detectPillar(quote) {
  const text = sanitizeText(quote, 220)
  return pillarRules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'growth'
}

export function scoreShareability(quote) {
  const text = sanitizeText(quote, 220)
  const words = text.split(/\s+/).filter(Boolean)
  let score = 42
  if (words.length >= 7 && words.length <= 18) score += 18
  if (/\b(you|your|yourself)\b/i.test(text)) score += 10
  if (/\b(but|before|until|instead|when|without|not)\b/i.test(text)) score += 8
  if (/\b(quit|fear|focus|discipline|future|worth|quiet|progress|pain|hard)\b/i.test(text)) score += 10
  if (/[.!?]$/.test(text)) score += 4
  if (words.length > 25) score -= 18
  return Math.max(0, Math.min(100, score))
}

function objectiveFor(cursor) {
  return ['share', 'save', 'retain', 'share', 'follow'][cursor % 5]
}

function recipePerformance(posts, format) {
  const groups = new Map()
  for (const post of posts ?? []) {
    const growth = post.design?.growth
    const performance = post.design?.performance
    const legacyRecipe = GROWTH_RECIPES.find((recipe) => recipe.template === post.design?.template && recipe.animation === post.design?.animation)
      ?? GROWTH_RECIPES.find((recipe) => recipe.template === post.design?.template)
    const recipeKey = growth?.recipe || legacyRecipe?.key
    if (post.format !== format || !recipeKey || !performance || performance.reach < 20) continue
    const current = groups.get(recipeKey) ?? { score: 0, weight: 0 }
    const weight = Math.max(0.1, performance.confidence / 100)
    current.score += performance.score * weight
    current.weight += weight
    groups.set(recipeKey, current)
  }
  return new Map([...groups].map(([key, value]) => [key, value.score / value.weight]))
}

export function growthDesignFor(quote, format = 'reel', cursor = 0, posts = []) {
  const pillar = detectPillar(quote)
  const objective = objectiveFor(cursor)
  const performance = recipePerformance(posts, format)
  const ranked = GROWTH_RECIPES
    .map((recipe) => ({ recipe, score: performance.get(recipe.key) ?? null }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => right.score - left.score)
  const exploit = ranked.length >= 2 && cursor % 4 !== 0
  const recipe = exploit
    ? ranked[cursor % Math.min(3, ranked.length)].recipe
    : GROWTH_RECIPES[cursor % GROWTH_RECIPES.length]
  const pillarHooks = hooks[pillar] ?? hooks.growth
  const objectiveCtas = ctas[objective]
  const visual = normalizeDesign({
    ...recipe,
    animation: format === 'post' ? 'static' : recipe.animation,
    music: format === 'post' ? 'silent' : recipe.music,
  }, format)
  return {
    ...visual,
    growth: {
      version: GROWTH_VERSION,
      recipe: recipe.key,
      pillar,
      hook: pillarHooks[Math.floor(cursor / 2) % pillarHooks.length],
      cta: objectiveCtas[Math.floor(cursor / 3) % objectiveCtas.length],
      objective,
      shareabilityScore: scoreShareability(quote),
      selection: exploit ? 'exploit' : 'explore',
    },
    performance: null,
  }
}

export function calculatePerformanceScore(post, metrics) {
  const reach = Math.max(1, Number(metrics.reach) || 0)
  const durationMs = Math.max(1, Number(post.design?.duration || 8) * 1000)
  const completion = Math.min(1.25, (Number(metrics.averageWatchTimeMs) || 0) / durationMs)
  const shareRate = (Number(metrics.shares) || 0) / reach
  const saveRate = (Number(metrics.saved) || 0) / reach
  const likeRate = (Number(metrics.likes) || 0) / reach
  const commentRate = (Number(metrics.comments) || 0) / reach
  const raw = post.format === 'reel'
    ? 32 * (completion / 1.25) + 28 * Math.min(1, shareRate / .03) + 20 * Math.min(1, saveRate / .04) + 12 * Math.min(1, likeRate / .08) + 8 * Math.min(1, commentRate / .02)
    : 36 * Math.min(1, shareRate / .03) + 28 * Math.min(1, saveRate / .04) + 20 * Math.min(1, likeRate / .08) + 16 * Math.min(1, commentRate / .02)
  const confidence = Math.min(1, reach / 250)
  return {
    score: Math.round(raw * confidence + 50 * (1 - confidence)),
    confidence: Math.round(confidence * 100),
  }
}
