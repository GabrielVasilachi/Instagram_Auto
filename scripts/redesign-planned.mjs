import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { supabase } from '../server/supabase.mjs';
import { captionFor } from '../server/content-plan.mjs';
import { growthDesignFor } from '../server/growth-engine.mjs';
import { FOLLOWER_STANDARD, followerSeries } from '../server/follower-series.mjs';
import { planReel } from '../server/reel-plan.mjs';

const apply = process.argv.includes('--apply');
const data = JSON.parse(
  await readFile(new URL('../content/follower-editions.json', import.meta.url), 'utf8'),
);
const now = new Date().toISOString();
const { data: posts, error } = await supabase
  .from('posts')
  .select('id,quote,caption,accent,design,media_url,scheduled_for,format,auto_generated')
  .eq('status', 'scheduled')
  .order('scheduled_for')
  .order('id');
if (error) throw error;

const pillars = Object.keys(followerSeries);
const used = new Set(posts.filter((post) => post.design?.growth?.version === FOLLOWER_STANDARD)
  .map((post) => post.quote));
const artwork = {
  focus: '#9cecff',
  discipline: '#dafa97',
  resilience: '#ffc6a6',
};
const changes = [];

for (const [index, post] of posts.entries()) {
  if (!post.auto_generated || post.design?.editorMedia ||
      post.design?.growth?.version === FOLLOWER_STANDARD) continue;
  const seriesOrder = pillars.map((_, offset) => pillars[(index + offset) % pillars.length]);
  const pillar = seriesOrder.find((key) => data[key].some((beats) => !used.has(beats.join(' '))));
  if (!pillar) throw new Error('Add more unique episodes before updating the queue.');
  const quote = data[pillar].map((beats) => beats.join(' ')).find((message) => !used.has(message));
  used.add(quote);
  const design = growthDesignFor(quote, post.format, index, [], pillar);
  Object.assign(design, {
    template: followerSeries[pillar].template,
    textAlign: 'left',
    textPosition: 'center',
    animation: post.format === 'reel' ? 'float' : 'static',
    reelVersion: null,
  });
  if (post.format === 'reel') design.duration = planReel(quote, design).duration;
  changes.push({ before: post, after: {
    quote,
    design,
    accent: artwork[pillar],
    caption: captionFor(quote, post.format, index, design.growth),
    media_url: null,
  } });
}

console.log(JSON.stringify({
  scheduled: posts.length,
  changes: changes.length,
  overdue: posts.filter((post) => post.scheduled_for <= now).length,
  formats: Object.fromEntries(['post', 'reel'].map((format) =>
    [format, changes.filter(({ before }) => before.format === format).length])),
  durations: changes.filter(({ before }) => before.format === 'reel').map(({ after }) => after.design.duration),
}));

if (apply && changes.length) {
  await mkdir('data', { recursive: true });
  const backup = `data/planned-before-redesign-${Date.now()}.json`;
  await writeFile(backup, JSON.stringify(changes.map(({ before }) => before), null, 2), { mode: 0o600 });
  let changed = 0;
  const conflicts = [];
  for (const { before, after } of changes) {
    let update = supabase.from('posts').update(after)
      .eq('id', before.id).eq('status', 'scheduled').eq('scheduled_for', before.scheduled_for)
      .eq('quote', before.quote).eq('caption', before.caption).eq('accent', before.accent)
      .eq('auto_generated', true);
    for (const key of ['design', 'media_url']) {
      update = before[key] == null ? update.is(key, null) :
        update.eq(key, key === 'design' ? JSON.stringify(before[key]) : before[key]);
    }
    const result = await update.select('id').maybeSingle();
    if (result.error) throw result.error;
    if (result.data) changed++;
    else conflicts.push(before.id);
  }
  console.log(JSON.stringify({ changed, conflicts, backup }));
  if (conflicts.length) process.exitCode = 1;
}
