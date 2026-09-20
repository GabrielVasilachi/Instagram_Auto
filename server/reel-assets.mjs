import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'reels')
// Operator-curated local assets only; never download arbitrary URLs through FFmpeg.
export async function selectAssets(mood, seed = '') {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8').catch(() => '{"assets":[]}'))
  const result = {}
  for (const kind of ['video', 'audio']) {
    const choices = (manifest.assets || []).filter(a => a.kind === kind && a.moods?.includes(mood) && a.license && a.source && a.commercialUse === true && a.attributionRequired === false)
    if (!choices.length) continue
    const hash = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0)
    const asset = choices[hash % choices.length]
    const file = await realpath(path.resolve(root, asset.file))
    if (!file.startsWith(root + path.sep)) throw new Error('Media asset must remain inside assets/reels.')
    result[kind] = file
  }
  return result
}
