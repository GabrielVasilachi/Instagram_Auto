import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeAccent, normalizeDesign, sanitizeText } from './design.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontDirectory = path.join(root, 'assets', 'fonts')
process.env.FONTCONFIG_FILE ||= path.join(fontDirectory, 'fonts.conf')
process.env.XDG_CACHE_HOME ||= '/tmp/silent-forward-font-cache'
const { default: sharp } = await import('sharp')
const fonts = {
  sans: { family: 'Inter', file: path.join(fontDirectory, 'Inter.ttf') },
  serif: { family: 'Lora', file: path.join(fontDirectory, 'Lora.ttf') },
  mono: { family: 'JetBrains Mono', file: path.join(fontDirectory, 'JetBrainsMono.ttf') },
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character])
}

function themeSvg(template, width, height) {
  const themes = {
    midnight: `
      <radialGradient id="base" cx="82%" cy="12%"><stop offset="0" stop-color="#2b3035"/><stop offset="0.38" stop-color="#111417"/><stop offset="1" stop-color="#050608"/></radialGradient>
      <rect width="100%" height="100%" fill="url(#base)"/>
      <circle cx="${width + 20}" cy="40" r="260" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="2"/>
    `,
    aurora: `
      <linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#05070d"/><stop offset=".55" stop-color="#11152a"/><stop offset="1" stop-color="#071d1b"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#64ffd2" stop-opacity=".32"/><stop offset="1" stop-color="#64ffd2" stop-opacity="0"/></radialGradient>
      <rect width="100%" height="100%" fill="url(#base)"/><ellipse cx="${width * .75}" cy="${height * .2}" rx="520" ry="330" fill="url(#glow)" transform="rotate(-18 ${width * .75} ${height * .2})"/>
    `,
    ember: `
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#160807"/><stop offset=".48" stop-color="#0c0a0b"/><stop offset="1" stop-color="#201006"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#ff5c35" stop-opacity=".36"/><stop offset="1" stop-color="#ff5c35" stop-opacity="0"/></radialGradient>
      <rect width="100%" height="100%" fill="url(#base)"/><circle cx="${width * .18}" cy="${height * .78}" r="460" fill="url(#glow)"/>
    `,
    ocean: `
      <linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#020b13"/><stop offset=".55" stop-color="#08202e"/><stop offset="1" stop-color="#071018"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#35c8ff" stop-opacity=".3"/><stop offset="1" stop-color="#35c8ff" stop-opacity="0"/></radialGradient>
      <rect width="100%" height="100%" fill="url(#base)"/><ellipse cx="${width * .9}" cy="${height * .6}" rx="540" ry="740" fill="url(#glow)"/>
      <path d="M-120 ${height * .35} Q ${width * .25} ${height * .2}, ${width * .55} ${height * .4} T ${width + 100} ${height * .3}" fill="none" stroke="#8ce8ff" stroke-opacity=".09" stroke-width="3"/>
    `,
    monochrome: `
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#222"/><stop offset=".5" stop-color="#090909"/><stop offset="1" stop-color="#171717"/></linearGradient>
      <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M72 0H0V72" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
      <rect width="100%" height="100%" fill="url(#base)"/><rect width="100%" height="100%" fill="url(#grid)"/>
    `,
    paper: `
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f3efe6"/><stop offset="1" stop-color="#d9d2c4"/></linearGradient>
      <filter id="noise"><feTurbulence baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .045 0"/></filter>
      <rect width="100%" height="100%" fill="url(#base)"/><rect width="100%" height="100%" filter="url(#noise)" opacity=".45"/>
    `,
    forest: `<linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#03100c"/><stop offset=".55" stop-color="#0b241a"/><stop offset="1" stop-color="#142b22"/></linearGradient><radialGradient id="glow"><stop stop-color="#79d99a" stop-opacity=".22"/><stop offset="1" stop-color="#79d99a" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><circle cx="${width * .22}" cy="${height * .18}" r="520" fill="url(#glow)"/>`,
    dusk: `<linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#130b1e"/><stop offset=".55" stop-color="#2a173a"/><stop offset="1" stop-color="#5a283f"/></linearGradient><radialGradient id="glow"><stop stop-color="#ff9d70" stop-opacity=".25"/><stop offset="1" stop-color="#ff9d70" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><ellipse cx="${width * .78}" cy="${height * .22}" rx="500" ry="360" fill="url(#glow)"/>`,
    sandstone: `<linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2b1d15"/><stop offset=".5" stop-color="#6c4934"/><stop offset="1" stop-color="#1a1210"/></linearGradient><rect width="100%" height="100%" fill="url(#base)"/><path d="M-80 ${height * .72} Q ${width * .3} ${height * .56}, ${width + 80} ${height * .72}" fill="none" stroke="#ffd19b" stroke-opacity=".12" stroke-width="120"/>`,
    neon: `<linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#03040a"/><stop offset=".55" stop-color="#10112a"/><stop offset="1" stop-color="#14061c"/></linearGradient><radialGradient id="cyan"><stop stop-color="#33e7ff" stop-opacity=".25"/><stop offset="1" stop-color="#33e7ff" stop-opacity="0"/></radialGradient><radialGradient id="pink"><stop stop-color="#ff4fc8" stop-opacity=".2"/><stop offset="1" stop-color="#ff4fc8" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><circle cx="${width * .16}" cy="${height * .75}" r="430" fill="url(#cyan)"/><circle cx="${width * .9}" cy="${height * .16}" r="390" fill="url(#pink)"/>`,
    obsidian: `<linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050506"/><stop offset=".5" stop-color="#141416"/><stop offset="1" stop-color="#020203"/></linearGradient><pattern id="grid" width="110" height="110" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M110 0H0V110" fill="none" stroke="#fff" stroke-opacity=".025"/></pattern><rect width="100%" height="100%" fill="url(#base)"/><rect width="100%" height="100%" fill="url(#grid)"/>`,
    meadow: `<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#193246"/><stop offset=".58" stop-color="#254d50"/><stop offset="1" stop-color="#14271c"/></linearGradient><radialGradient id="sun"><stop stop-color="#f4efb2" stop-opacity=".25"/><stop offset="1" stop-color="#f4efb2" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><circle cx="${width * .76}" cy="${height * .18}" r="420" fill="url(#sun)"/>`,
    cinematic: `<linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#030405"/><stop offset=".55" stop-color="#101417"/><stop offset="1" stop-color="#252b2d"/></linearGradient><radialGradient id="beam"><stop stop-color="#c7d1c2" stop-opacity=".13"/><stop offset="1" stop-color="#c7d1c2" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><ellipse cx="${width * .78}" cy="${height * .18}" rx="520" ry="900" fill="url(#beam)" transform="rotate(22 ${width * .78} ${height * .18})"/>`,
    concrete: `<linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#252728"/><stop offset=".5" stop-color="#111314"/><stop offset="1" stop-color="#292b2b"/></linearGradient><pattern id="cuts" width="190" height="190" patternUnits="userSpaceOnUse" patternTransform="rotate(-13)"><path d="M190 0H0V190" fill="none" stroke="#fff" stroke-opacity=".025" stroke-width="2"/></pattern><rect width="100%" height="100%" fill="url(#base)"/><rect width="100%" height="100%" fill="url(#cuts)"/>`,
    afterglow: `<linearGradient id="base" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#09080e"/><stop offset=".55" stop-color="#24151d"/><stop offset="1" stop-color="#6d382b"/></linearGradient><radialGradient id="sunset"><stop stop-color="#ffad73" stop-opacity=".28"/><stop offset="1" stop-color="#ffad73" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><circle cx="${width * .78}" cy="${height * .22}" r="520" fill="url(#sunset)"/>`,
    signal: `<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b0d0e"/><stop offset="1" stop-color="#020303"/></linearGradient><radialGradient id="signalGlow"><stop stop-color="#d9ff3f" stop-opacity=".16"/><stop offset="1" stop-color="#d9ff3f" stop-opacity="0"/></radialGradient><rect width="100%" height="100%" fill="url(#base)"/><circle cx="${width * .12}" cy="${height * .78}" r="540" fill="url(#signalGlow)"/><path d="M${width * .78} 0V${height}" stroke="#d9ff3f" stroke-opacity=".055" stroke-width="2"/>`,
  }

  return themes[template] ?? themes.midnight
}

function backgroundSvg(post, width, height, design) {
  const light = design.template === 'paper'
  const topLabel = post.storyPromotion ? `NEW ${post.storyPromotion} · SILENT FORWARD` : 'SILENT FORWARD'
  const bottomLabel = post.storyPromotion ? 'WATCH NOW ON PROFILE · @silentforward' : '@silentforward'
  const topY = post.storyPromotion ? 165 : 105
  const bottomY = post.storyPromotion ? height - 170 : height - 70
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${themeSvg(design.template, width, height)}
    <filter id="filmGrain"><feTurbulence baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .025 0"/></filter>
    <radialGradient id="vignette"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
    <rect width="100%" height="100%" filter="url(#filmGrain)" opacity=".45"/><rect width="100%" height="100%" fill="url(#vignette)"/>
    <rect width="100%" height="100%" fill="#000" opacity="${design.overlayOpacity / 100}"/>
    <text x="90" y="${topY}" fill="${light ? '#4f4a43' : '#8b9096'}" font-family="sans-serif" font-size="18" font-weight="700" letter-spacing="${post.storyPromotion ? 4 : 7}">${topLabel}</text>
    <text x="90" y="${bottomY}" fill="${light ? '#5e5850' : '#73787e'}" font-family="sans-serif" font-size="20" font-weight="${post.storyPromotion ? 700 : 400}" letter-spacing="${post.storyPromotion ? 2 : 0}">${bottomLabel}</text>
  </svg>`)
}

async function textOverlay(post, width, height, design) {
  const font = fonts[design.font]
  const rawQuote = sanitizeText(post.quote, 220)
  const quote = design.textCase === 'uppercase' ? rawQuote.toUpperCase() : rawQuote
  const textColor = design.template === 'paper' ? '#171714' : '#f6f6f2'
  const contentWidth = width - 180
  const textBuffer = await sharp({
    text: {
      text: `<span foreground="${textColor}" font_weight="700" letter_spacing="${design.letterSpacing * 1024}">${escapeXml(quote)}</span>`,
      font: `${font.family} ${design.fontSize}`,
      fontfile: font.file,
      width: contentWidth,
      align: design.textAlign,
      spacing: Math.round(design.fontSize * ((design.lineHeight - 100) / 100)),
      wrap: 'word-char',
      rgba: true,
    },
  }).png().toBuffer()
  const metadata = await sharp(textBuffer).metadata()
  const textHeight = metadata.height ?? Math.round(design.fontSize * 4)
  const positions = {
    top: post.format === 'reel' ? 330 : 260,
    center: Math.round((height - textHeight) / 2),
    bottom: height - textHeight - (post.format === 'reel' ? 330 : 260),
  }
  const y = Math.max(180, Math.min(height - textHeight - 170, positions[design.textPosition]))
  const accentX = design.textAlign === 'center' ? Math.round((width - 150) / 2) : design.textAlign === 'right' ? width - 240 : 90
  const accent = await sharp({
    create: { width: 150, height: 12, channels: 4, background: normalizeAccent(post.accent) },
  }).png().toBuffer()

  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([
    { input: textBuffer, left: 90, top: y },
    { input: accent, left: accentX, top: Math.min(height - 140, y + textHeight + 34) },
  ]).png().toBuffer()
}

async function growthOverlay(post, width, height, design, kind) {
  const growth = design.growth ?? {}
  const text = kind === 'hook'
    ? growth.hook || 'A QUIET REMINDER FOR TODAY'
    : growth.cta || 'KEEP MOVING FORWARD · @SILENTFORWARD'
  const light = design.template === 'paper'
  const textColor = light ? '#171714' : '#f7f7f2'
  const labelColor = light ? '#605b52' : '#8b9096'
  const align = kind === 'hook' ? 'left' : 'center'
  const fontSize = kind === 'hook' ? 66 : 54
  const contentWidth = width - 180
  const textBuffer = await sharp({
    text: {
      text: `<span foreground="${textColor}" font_weight="800" letter_spacing="${kind === 'hook' ? 1450 : 650}">${escapeXml(text.toUpperCase())}</span>`,
      font: `Inter ${fontSize}`,
      fontfile: fonts.sans.file,
      width: contentWidth,
      align,
      spacing: 8,
      wrap: 'word-char',
      rgba: true,
    },
  }).png().toBuffer()
  const metadata = await sharp(textBuffer).metadata()
  const textHeight = metadata.height ?? 180
  const top = Math.round((height - textHeight) / 2)
  const accent = await sharp({ create: { width: kind === 'hook' ? 120 : 70, height: 9, channels: 4, background: normalizeAccent(post.accent) } }).png().toBuffer()
  const label = await sharp({
    text: {
      text: `<span foreground="${labelColor}" font_weight="700" letter_spacing="2300">${kind === 'hook' ? 'SILENT NOTE' : 'SILENT FORWARD'}</span>`,
      font: 'Inter 17',
      fontfile: fonts.sans.file,
      width: contentWidth,
      align,
      rgba: true,
    },
  }).png().toBuffer()
  const accentLeft = kind === 'hook' ? 90 : Math.round((width - 70) / 2)
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: label, left: 90, top: Math.max(230, top - 95) },
      { input: textBuffer, left: 90, top },
      { input: accent, left: accentLeft, top: Math.min(height - 230, top + textHeight + 34) },
    ]).png().toBuffer()
}

export async function generateImage(post, targetPath, layer = 'complete') {
  const width = 1080
  const height = post.format === 'reel' ? 1920 : 1350
  const design = normalizeDesign(post.design, post.format)
  const overlay = layer === 'background' ? null : await textOverlay(post, width, height, design)

  if (layer === 'text') {
    await sharp(overlay).png({ quality: 96 }).toFile(targetPath)
    return targetPath
  }

  const base = sharp(backgroundSvg(post, width, height, design))
  if (overlay) base.composite([{ input: overlay, left: 0, top: 0 }])
  await base.png({ quality: 96 }).toFile(targetPath)
  return targetPath
}

function audioSource(music, duration) {
  const expressions = {
    ambient: '0.018*(sin(2*PI*174*t)+sin(2*PI*220*t)+sin(2*PI*261.63*t))',
    deep: '0.02*(sin(2*PI*110*t)+sin(2*PI*146.83*t)+sin(2*PI*196*t))',
    focus: '0.016*(sin(2*PI*196*t)+sin(2*PI*246.94*t)+sin(2*PI*293.66*t))',
    pulse: '0.022*sin(2*PI*110*t)*(0.65+0.35*sin(2*PI*0.5*t))',
    serenity: '0.014*(sin(2*PI*130.81*t)+sin(2*PI*196*t)+sin(2*PI*261.63*t))*(0.75+0.25*sin(2*PI*0.08*t))',
    nostalgia: '0.013*(sin(2*PI*146.83*t)+sin(2*PI*220*t)+sin(2*PI*293.66*t))*(0.72+0.28*sin(2*PI*0.12*t))',
    horizon: '0.015*(sin(2*PI*164.81*t)+sin(2*PI*246.94*t)+sin(2*PI*329.63*t))',
    starlight: '0.011*(sin(2*PI*261.63*t)+sin(2*PI*392*t)+sin(2*PI*523.25*t))*(0.7+0.3*sin(2*PI*0.16*t))',
    snowfall: '0.01*(sin(2*PI*174.61*t)+sin(2*PI*233.08*t)+sin(2*PI*349.23*t))*(0.68+0.32*sin(2*PI*0.06*t))',
  }

  return music === 'silent'
    ? `anullsrc=r=44100:cl=stereo:d=${duration}`
    : `aevalsrc=${expressions[music] ?? expressions.ambient}:s=44100:d=${duration}`
}

function backgroundFilter(animation, width, height, duration) {
  const scaledWidth = Math.round(width * 1.06)
  const scaledHeight = Math.round(height * 1.06)
  const filters = {
    drift: `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:x='(in_w-out_w)*(t/${duration})':y='(in_h-out_h)*(0.45+0.35*sin(t*0.7))'`,
    slide: `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:x='(in_w-out_w)*(1-t/${duration})':y='(in_h-out_h)/2'`,
    zoom: `zoompan=z='min(zoom+0.00045,1.065)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=30`,
    pulse: `zoompan=z='1.025+0.018*sin(on/18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=30`,
    float: `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:x='(in_w-out_w)*(0.5+0.35*sin(t*0.35))':y='(in_h-out_h)*(0.5+0.32*cos(t*0.42))'`,
    pan: `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:x='(in_w-out_w)*(0.5+0.5*sin(t*0.22))':y='(in_h-out_h)/2'`,
    breathe: `zoompan=z='1.018+0.012*sin(on/25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=30`,
    static: `scale=${width}:${height}`,
  }
  return filters[animation] ?? filters.drift
}

export async function generateMedia(post, mediaDirectory) {
  await mkdir(mediaDirectory, { recursive: true })
  const imagePath = path.join(mediaDirectory, `${post.id}.png`)
  if (post.format === 'post') return generateImage(post, imagePath)
  if (!ffmpegPath) throw new Error('Generatorul video nu este disponibil.')

  const design = normalizeDesign(post.design, post.format)
  const backgroundPath = path.join(mediaDirectory, `${post.id}-background.png`)
  const textPath = path.join(mediaDirectory, `${post.id}-text.png`)
  const hookPath = path.join(mediaDirectory, `${post.id}-hook.png`)
  const ctaPath = path.join(mediaDirectory, `${post.id}-cta.png`)
  const videoPath = path.join(mediaDirectory, `${post.id}.mp4`)
  await generateImage(post, backgroundPath, 'background')
  await generateImage(post, textPath, 'text')
  await sharp(await growthOverlay(post, 1080, 1920, design, 'hook')).toFile(hookPath)
  await sharp(await growthOverlay(post, 1080, 1920, design, 'cta')).toFile(ctaPath)

  const hookEnd = Math.min(1.35, design.duration * .2)
  const ctaStart = Math.max(hookEnd + 2.8, design.duration - 1.2)
  const filter = `[0:v]${backgroundFilter(design.animation, 1080, 1920, design.duration)},format=yuv420p[bg];[1:v]format=rgba[quote];[2:v]format=rgba[hook];[3:v]format=rgba[cta];[bg][hook]overlay=0:0:enable='between(t,0,${hookEnd})'[stage1];[stage1][quote]overlay=0:0:enable='between(t,${Math.max(0, hookEnd - .1)},${Math.min(design.duration, ctaStart + .1)})'[stage2];[stage2][cta]overlay=0:0:enable='gte(t,${ctaStart})',format=yuv420p[v];[4:a]afade=t=in:st=0:duration=0.5,afade=t=out:st=${Math.max(0, design.duration - 1)}:duration=1,volume=${design.musicVolume / 100}[a]`

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        '-y', '-threads', '2', '-filter_complex_threads', '1', '-loop', '1', '-i', backgroundPath,
        '-loop', '1', '-i', textPath,
        '-loop', '1', '-i', hookPath,
        '-loop', '1', '-i', ctaPath,
        '-f', 'lavfi', '-i', audioSource(design.music, design.duration),
        '-t', String(design.duration),
        '-filter_complex', filter,
        '-map', '[v]', '-map', '[a]',
        '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', videoPath,
      ])
      let error = ''
      child.stderr.on('data', (chunk) => { error += chunk.toString() })
      child.on('error', reject)
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Generarea video a eșuat: ${error.slice(-700)}`)))
    })
  } finally {
    await Promise.all([backgroundPath, textPath, hookPath, ctaPath].map((file) => unlink(file).catch(() => {})))
  }

  return videoPath
}

export async function generateStoryPromotion(post, mediaDirectory) {
  const storyPost = {
    ...post,
    id: `${post.id}-story`,
    format: 'reel',
    storyPromotion: post.format === 'reel' ? 'REEL' : 'POST',
    design: {
      ...post.design,
      duration: Math.min(10, Math.max(6, Number(post.design?.duration) || 8)),
    },
  }
  return {
    filePath: await generateMedia(storyPost, mediaDirectory),
    uploadPost: storyPost,
  }
}

export function mediaDimensions(format) {
  return format === 'reel' ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 }
}
