import { getMedia } from './storage';
import { textCanvas } from './render';
import type { ExportResult, ExportSettings, Project } from './types';

async function json(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
const post = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }).then(json);
export async function uploadAsset(
  blob: Blob,
  kind: string,
  signal: AbortSignal,
  onProgress: (value: number) => void,
): Promise<string> {
  const ticket = await post('/api/video-editor/upload-ticket', { kind }, signal);
  if (ticket.mode === 'local') {
    const result = await fetch(ticket.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
      signal,
    }).then(json);
    onProgress(1);
    return result.token;
  }
  const chunkSize = 6 * 1024 * 1024,
    uploadId = crypto.randomUUID();
  let result;
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, blob.size),
      body = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) body.set(key, String(value));
    body.set('file', blob.slice(offset, end), kind === 'image' ? 'image.png' : 'media');
    result = await fetch(ticket.url, {
      method: 'POST',
      signal,
      headers: {
        'X-Unique-Upload-Id': uploadId,
        'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}`,
      },
      body,
    }).then(json);
    onProgress(end / blob.size);
  }
  return (await post('/api/video-editor/verify-upload', { ticket: ticket.token, result }, signal))
    .token;
}
export async function exportProject(
  project: Project,
  settings: ExportSettings,
  signal: AbortSignal,
  progress: (phase: string, value: number) => void,
): Promise<ExportResult> {
  const snapshot = structuredClone(project),
    assets: { id: string; token: string }[] = [],
    needed = new Set(
      snapshot.clips.filter((c) => c.kind !== 'text').map((c) => ('assetId' in c ? c.assetId : '')),
    );
  const pending: { id: string; kind: string; blob: Blob }[] = [];
  for (const id of needed) {
    const asset = snapshot.assets.find((a) => a.id === id),
      blob = await getMedia(id);
    if (!asset || !blob)
      throw new Error(`Missing media: ${asset?.name || id}. Relink the original file in Media.`);
    pending.push({ id, kind: asset.kind, blob });
  }
  await document.fonts.ready;
  for (const clip of snapshot.clips)
    if (clip.kind === 'text') {
      const canvas = textCanvas(clip, snapshot.ratio),
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Could not prepare text.'))),
            'image/png',
          ),
        );
      Object.assign(clip, { assetId: clip.id });
      pending.push({ id: clip.id, kind: 'image', blob });
    }
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i],
      token = await uploadAsset(item.blob, item.kind, signal, (value) =>
        progress('Uploading media', ((i + value) / pending.length) * 100),
      );
    assets.push({ id: item.id, token });
  }
  // Thumbnails and waveform arrays are local UI metadata, not export input.
  const response = await fetch('/api/video-editor/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: { ...snapshot, assets: [] }, settings, assets }),
    signal,
  });
  if (!response.ok) {
    await json(response);
    throw new Error('Export failed.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming export is not supported in this browser.');
  const decoder = new TextDecoder();
  let buffer = '',
    completed: ExportResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines)
      if (line.trim()) {
        const event = JSON.parse(line);
        if (event.phase === 'error') throw new Error(event.error);
        if (event.phase === 'complete') completed = event.result;
        else if (event.phase !== 'heartbeat')
          progress(
            event.phase === 'preparing'
              ? 'Preparing media'
              : event.phase === 'uploading'
                ? 'Saving your video'
                : 'Rendering video',
            event.progress,
          );
      }
    if (done) break;
  }
  if (!completed)
    throw new Error('Export connection ended before completion. Try 720p or a shorter timeline.');
  return completed;
}
export const sendToPlanner = (
  result: ExportResult,
  name: string,
  caption: string,
  scheduledFor: string,
) => post('/api/video-editor/planner', { token: result.token, name, caption, scheduledFor });
