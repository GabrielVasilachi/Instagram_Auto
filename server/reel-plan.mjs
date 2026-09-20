// Shared deterministic timing: the preview and renderer use the same scene clock.
export const REEL_VERSION = '2026.2'
export const MOODS = {
  discipline: { match: /disciplin|habit|work|routine|excuse|consisten/i, music: ['pulse', 'focus'], templates: ['concrete', 'midnight'] },
  silence: { match: /quiet|silenc|private|noise|focus|attention/i, music: ['ambient', 'serenity'], templates: ['obsidian', 'midnight'] },
  ambition: { match: /future|success|goal|dream|potential|ambition/i, music: ['horizon', 'focus'], templates: ['cinematic', 'midnight'] },
  pain: { match: /pain|loss|lonel|reject|hurt|disappoint/i, music: ['nostalgia', 'snowfall'], templates: ['ocean', 'obsidian'] },
  comeback: { match: /again|rebuild|restart|fail|quit|return|start|setback/i, music: ['horizon', 'starlight'], templates: ['afterglow', 'cinematic'] },
  'self-respect': { match: /respect|worth|boundar|approval|leave|permission/i, music: ['deep', 'serenity'], templates: ['obsidian', 'concrete'] },
}
export function moodFor(text) { return Object.keys(MOODS).find(key => MOODS[key].match.test(text)) || 'ambition' }
export function qualityIssue(text) {
  const words = String(text).trim().split(/\s+/)
  if (!text || text.length > 220 || words.length > 40) return 'Use 1–40 words, at most 220 characters.'
  if (/^(believe in yourself|never give up|work hard|stay motivated)[.!]?$/i.test(text.trim())) return 'Choose a more specific message.'
  if (/(\b\w+\b)(?:\s+\1){2}/i.test(text) || /[!?]{3}/.test(text)) return 'Remove repeated words or punctuation.'
  if (words.some(word => word.length > 28)) return 'A word is too long to display safely.'
  return null
}
export function similar(a, b) {
  const tokens = t => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean))
  const x = tokens(a), y = tokens(b)
  return [...x].filter(t => y.has(t)).length / Math.max(1, new Set([...x, ...y]).size) >= .72
}
export function chooseQuote(quotes, cursor, posts = []) {
  const recent = posts.slice(-90).map(p => p.quote)
  for (let n = 0; n < quotes.length; n++) {
    const quote = quotes[(cursor + n) % quotes.length]
    try { sceneTexts(quote) } catch { continue }
    if (!recent.some(old => similar(quote, old))) return quote
  }
  throw new Error('No fresh quality messages remain. Add messages to content/quotes.json.')
}
export function sceneTexts(text) {
  const issue = qualityIssue(text)
  if (issue) throw new Error(issue)
  const chunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  const scenes = []
  for (const chunk of chunks) {
    const words = chunk.trim().split(/\s+/)
    while (words.length) {
      let take = Math.min(10, words.length)
      if (words.length > 10) {
        for (let i = 9; i >= 4; i--) if (/[,;:]$/.test(words[i - 1]) || /^(but|so|instead|because|and)$/i.test(words[i])) { take = i; break }
      }
      scenes.push(words.splice(0, take).join(' '))
    }
  }
  // Do not truncate meaning just to hit a scene count.
  if (scenes.length > 4) throw new Error('Simplify the message to at most four short scenes.')
  return scenes
}
export function planReel(text, design = {}) {
  let time = .15
  const scenes = sceneTexts(text).map((text, index, all) => {
    const words = text.split(/\s+/).length
    const lines = Math.ceil(text.length / 23)
    const hold = Math.max(2, words / 2.8 + Math.max(0, lines - 1) * .15) + .45
    const duration = .35 + hold + .4
    const scene = { text, role: index === 0 ? 'hook' : index === all.length - 1 ? 'payoff' : 'message', start: time, hold, duration, end: time + duration }
    time += duration + .08
    return scene
  })
  if (time + .2 < 5) {
    const extra = 5 - time - .2
    const last = scenes[scenes.length - 1]
    last.hold += extra
    last.duration += extra
    last.end += extra
    time += extra
  }
  const duration = Math.max(5, time + .2)
  return { version: REEL_VERSION, mood: moodFor(text), scenes, duration: Math.round(duration * 100) / 100 }
}
