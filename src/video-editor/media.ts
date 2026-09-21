import { useEffect, useRef, useState } from 'react';
import { getMedia, saveMedia } from './storage';
import { uid } from './model';
import type { MediaAsset, Resources } from './types';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
export function loaded(element: HTMLMediaElement | HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const event = element instanceof HTMLImageElement ? 'load' : 'loadeddata';
    const done = (error?: Error) => {
      clearTimeout(timer);
      element.removeEventListener(event, success);
      element.removeEventListener('error', failed);
      error ? reject(error) : resolve();
    };
    const success = () => done(),
      failed = () => done(new Error('This format or codec cannot be decoded by your browser.'));
    const timer = setTimeout(
      () => done(new Error('Media loading timed out. Try a smaller file or convert it to MP4.')),
      20_000,
    );
    element.addEventListener(event, success, { once: true });
    element.addEventListener('error', failed, { once: true });
  });
}
export async function inspectMedia(file: File): Promise<MediaAsset> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: maximum file size is 100 MB.`);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const kind = /^(png|jpe?g|webp)$/.test(ext)
    ? 'image'
    : /^(mp3|wav|aac|m4a)$/.test(ext)
      ? 'audio'
      : /^(mp4|mov|webm)$/.test(ext)
        ? 'video'
        : null;
  if (!kind) throw new Error(`${file.name}: use MP4, MOV, WebM, PNG, JPG, WebP, MP3, WAV or AAC.`);
  const element = kind === 'image' ? new Image() : document.createElement(kind);
  const url = URL.createObjectURL(file);
  try {
    if (element instanceof HTMLMediaElement) {
      element.preload = 'auto';
      element.muted = true;
    }
    const ready = loaded(element);
    element.src = url;
    await ready;
    const duration = element instanceof HTMLMediaElement ? element.duration : 5;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error(`${file.name}: invalid media duration.`);
    const width =
      element instanceof HTMLVideoElement
        ? element.videoWidth
        : element instanceof HTMLImageElement
          ? element.naturalWidth
          : 0;
    const height =
      element instanceof HTMLVideoElement
        ? element.videoHeight
        : element instanceof HTMLImageElement
          ? element.naturalHeight
          : 0;
    if (width * height > 34_000_000) throw new Error('Use media with a resolution of 8K or less.');
    const asset: MediaAsset = {
      id: uid(),
      name: file.name,
      kind,
      duration,
      width,
      height,
      size: file.size,
      mime: file.type,
    };
    if (kind !== 'audio') {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = Math.max(1, Math.round((200 * height) / width));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        element as HTMLVideoElement | HTMLImageElement,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      asset.thumbnail = canvas.toDataURL('image/jpeg', 0.65);
    } else if (file.size < 35 * 1024 * 1024) {
      const context = new AudioContext();
      try {
        const audio = await context.decodeAudioData(await file.arrayBuffer()),
          samples = audio.getChannelData(0),
          step = Math.max(1, Math.floor(samples.length / 100));
        asset.waveform = Array.from({ length: 100 }, (_, i) => {
          let peak = 0;
          for (let n = i * step; n < Math.min(samples.length, (i + 1) * step); n += 32)
            peak = Math.max(peak, Math.abs(samples[n]));
          return peak;
        });
      } catch {
        /* Decoding a waveform is optional; media playback remains available. */
      } finally {
        await context.close();
      }
    }
    await saveMedia(asset.id, file);
    return asset;
  } finally {
    if (element instanceof HTMLMediaElement) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    URL.revokeObjectURL(url);
  }
}
export function useMedia(assets: MediaAsset[], onError: (message: string) => void) {
  const resources = useRef<Resources>(new Map()),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      for (const [id, item] of resources.current)
        if (!assets.some((a) => a.id === id)) {
          URL.revokeObjectURL(item.url);
          resources.current.delete(id);
        }
      for (const asset of assets) {
        if (resources.current.has(asset.id)) continue;
        const blob = await getMedia(asset.id);
        if (cancelled) return;
        if (!blob) {
          onError(`Missing file: ${asset.name}. Restore it using Relink in the media library.`);
          continue;
        }
        const url = URL.createObjectURL(blob),
          element = asset.kind === 'image' ? new Image() : document.createElement(asset.kind);
        if (element instanceof HTMLMediaElement) {
          element.preload = 'auto';
          element.muted = true;
        }
        const ready = loaded(element);
        element.src = url;
        try {
          await ready;
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          resources.current.set(asset.id, { url, element });
          setRevision((n) => n + 1);
        } catch (error) {
          URL.revokeObjectURL(url);
          if (!cancelled)
            onError(
              `${asset.name}: ${error instanceof Error ? error.message : 'Cannot load media'}`,
            );
        }
      }
    }
    void sync().catch((error) => onError(String(error)));
    return () => {
      cancelled = true;
    };
  }, [assets, onError]);
  useEffect(
    () => () => {
      for (const item of resources.current.values()) URL.revokeObjectURL(item.url);
      resources.current.clear();
    },
    [],
  );
  return { resources, revision };
}
