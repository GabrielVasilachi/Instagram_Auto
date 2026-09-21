import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { generateImage, generateMedia, generateStoryPromotion } from '../server/media.mjs';

test('image, Reel and story render with bundled fonts and validated streams', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'silent-forward-test-'));
  const base = {
    id: 'image',
    quote: 'Disciplină, focus și progres.',
    caption: '',
    accent: '#62e6ff',
    format: 'post',
    design: {
      template: 'aurora',
      font: 'sans',
      textPosition: 'center',
      textAlign: 'left',
      fontSize: 76,
    },
  };
  try {
    const imagePath = path.join(directory, 'image.png');
    await generateImage(base, imagePath);
    const metadata = await sharp(await readFile(imagePath)).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1350);
    const videoPath = await generateMedia(
      {
        ...base,
        id: 'reel',
        format: 'reel',
        design: {
          ...base.design,
          template: 'meadow',
          font: 'serif',
          animation: 'breathe',
          music: 'starlight',
          musicVolume: 42,
          letterSpacing: 2,
          lineHeight: 118,
          overlayOpacity: 14,
          duration: 6,
        },
      },
      directory,
    );
    assert.ok((await stat(videoPath)).size > 50_000);
    const story = await generateStoryPromotion({ ...base, id: 'post-promotion' }, directory);
    assert.match(story.filePath, /post-promotion-story\.mp4$/);
    assert.equal(story.uploadPost.storyPromotion, 'POST');
    assert.ok((await stat(story.filePath)).size > 50_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
