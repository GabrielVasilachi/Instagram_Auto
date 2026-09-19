import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, stat, rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { cloudinaryConfigured } from '../cloudinary.mjs'
import { LIMITS } from './schema.mjs'

export const localDirectory = path.join(os.tmpdir(), 'silent-forward-editor-assets')
const secret = () => {
  if (!process.env.SESSION_SECRET) throw new Error('Session authentication must be configured.')
  return process.env.SESSION_SECRET
}
export function signToken(data, seconds = 86400) {
  const payload = Buffer.from(
    JSON.stringify({ ...data, expires: Date.now() + seconds * 1000 }),
  ).toString('base64url')
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`
}
export function readToken(token, purpose) {
  if (typeof token !== 'string' || token.length > 8000)
    throw new Error('Invalid media receipt. Export again.')
  const [payload, signature, extra] = token.split('.'),
    expected = createHmac('sha256', secret())
      .update(payload || '')
      .digest('base64url')
  if (
    extra ||
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error('Invalid media receipt.')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (data.purpose !== purpose || data.expires < Date.now() || !/^[a-z0-9-]{36}$/.test(data.id))
    throw new Error('Expired or invalid media receipt. Export again.')
  return data
}
export const cloudSignature = (values) =>
  createHash('sha1')
    .update(
      Object.entries(values)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&') + process.env.CLOUDINARY_API_SECRET,
    )
    .digest('hex')
export function uploadTicket(kind) {
  if (!['image', 'video', 'audio'].includes(kind)) throw new Error('Invalid media type.')
  const id = randomUUID(),
    cloud = cloudinaryConfigured(),
    resourceType = kind === 'image' ? 'image' : 'video'
  if (process.env.VERCEL && !cloud)
    throw new Error(
      'Cloudinary is required to export on Vercel. Configure the existing Cloudinary environment variables.',
    )
  const publicId = `silent-forward/editor-source/${id}`,
    token = signToken({ purpose: 'upload', id, kind, cloud, publicId, resourceType }, 3600)
  if (!cloud)
    return {
      mode: 'local',
      id,
      token,
      url: `/api/video-editor/assets/${id}?ticket=${encodeURIComponent(token)}`,
    }
  const fields = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), overwrite: false }
  return {
    mode: 'cloud',
    id,
    token,
    url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    fields: {
      ...fields,
      signature: cloudSignature(fields),
      api_key: process.env.CLOUDINARY_API_KEY,
    },
  }
}
export function verifyUpload(ticketToken, result) {
  const ticket = readToken(ticketToken, 'upload')
  if (
    !ticket.cloud ||
    result.public_id !== ticket.publicId ||
    result.resource_type !== ticket.resourceType ||
    !Number.isSafeInteger(result.version)
  )
    throw new Error('Upload verification failed.')
  const expected = cloudSignature({ public_id: result.public_id, version: result.version })
  if (
    typeof result.signature !== 'string' ||
    result.signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(result.signature), Buffer.from(expected))
  )
    throw new Error('Upload verification failed.')
  if (!/^[a-z0-9]{2,8}$/.test(result.format)) throw new Error('Unsupported uploaded format.')
  const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/${ticket.resourceType}/upload/v${result.version}/${ticket.publicId}.${result.format}`
  return {
    token: signToken({ purpose: 'asset', id: ticket.id, kind: ticket.kind, cloud: true, url }),
  }
}
export async function cleanLocalFiles() {
  await mkdir(localDirectory, { recursive: true })
  for (const name of await readdir(localDirectory)) {
    const file = path.join(localDirectory, name),
      info = await stat(file).catch(() => null)
    if (info && info.mtimeMs < Date.now() - 86400_000) await rm(file, { force: true })
  }
}
export async function downloadAsset(receipt, destination, signal) {
  if (!receipt.cloud)
    return {
      path: path.join(localDirectory, `${receipt.id}.media`),
      bytes: (await stat(path.join(localDirectory, `${receipt.id}.media`))).size,
    }
  const response = await fetch(receipt.url, { signal, redirect: 'error' })
  if (!response.ok || !response.body)
    throw new Error('An uploaded media file is unavailable. Try exporting again.')
  let bytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > LIMITS.fileBytes ? new Error('Media file exceeds 100 MB.') : null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(destination), {
    signal,
  })
  return { path: destination, bytes }
}
export async function uploadRenderedVideo(file, id, signal) {
  const { readFile } = await import('node:fs/promises'),
    bytes = await readFile(file),
    chunkSize = 10 * 1024 * 1024
  const publicId = `silent-forward/editor-export/${id}`,
    fields = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), overwrite: false }
  const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
    uploadId = randomUUID()
  let result
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(bytes.length, offset + chunkSize),
      body = new FormData()
    for (const [key, value] of Object.entries({
      ...fields,
      api_key: process.env.CLOUDINARY_API_KEY,
      signature: cloudSignature(fields),
    }))
      body.set(key, String(value))
    body.set('file', new Blob([bytes.subarray(offset, end)]), 'export.mp4')
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'X-Unique-Upload-Id': uploadId,
        'Content-Range': `bytes ${offset}-${end - 1}/${bytes.length}`,
      },
      body,
    })
    result = await response.json()
    if (!response.ok)
      throw new Error(result.error?.message || 'Could not upload the rendered video.')
  }
  if (!result?.secure_url || result.public_id !== publicId)
    throw new Error('Incomplete video upload.')
  return result.secure_url
}
export function isEditorMediaUrl(url) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || typeof url !== 'string') return false
  try {
    const parsed = new URL(url),
      prefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/`
    return (
      parsed.origin === 'https://res.cloudinary.com' &&
      parsed.pathname.startsWith(prefix) &&
      /^v\d+\/silent-forward\/editor-export\/[a-z0-9-]{36}\.mp4$/.test(
        parsed.pathname.slice(prefix.length),
      ) &&
      !parsed.search &&
      !parsed.hash
    )
  } catch {
    return false
  }
}
