import { seriesFor } from './follower-series.mjs';
import { brandUsername } from './branding.mjs';

export const REEL_TIMES = ['09:00', '15:30', '21:00'];
export const POST_TIME = '11:00';
export const POST_WEEKDAYS = [2, 6];

export const CONTENT_PILLARS = [
  'discipline',
  'focus',
  'consistency',
  'self-respect',
  'resilience',
  'deep-work',
  'quiet-confidence',
  'habits',
  'purpose',
  'mental-strength',
  'growth',
  'courage',
];

const pillarContext = {
  discipline: 'Discipline is not intensity. It is the quiet decision to keep one promise today.',
  focus: 'Protecting your attention is one of the most practical forms of self-respect.',
  resilience: 'A difficult season can slow the result without erasing the person you are becoming.',
  'self-respect': 'The standard you accept privately becomes the life you experience publicly.',
  courage: 'Courage usually looks like one useful action taken while fear is still present.',
  growth: 'Progress often becomes visible long after the daily choices that created it.',
  'quiet-confidence': 'Real confidence does not need constant proof, noise or permission.',
  purpose: 'Direction creates a calmer kind of momentum than pressure ever can.',
};

const pillarHashtags = {
  discipline: '#discipline #consistency #dailyhabits #selfmastery #motivation',
  focus: '#focus #deepwork #mentalclarity #productivity #mindset',
  resilience: '#resilience #keepgoing #mentalstrength #personalgrowth #motivation',
  'self-respect': '#selfrespect #selfworth #boundaries #confidence #mindset',
  courage: '#courage #fearlessmindset #takeaction #growthmindset #motivation',
  growth: '#personalgrowth #progress #growthmindset #betterself #motivation',
  'quiet-confidence': '#quietconfidence #confidence #selfbelief #innerstrength #mindset',
  purpose: '#purpose #direction #intentionality #focus #personaldevelopment',
};

export function captionFor(quote, format, cursor, growth = {}) {
  const pillar = growth.pillar || 'growth';
  const context = pillarContext[pillar] || pillarContext.growth;
  const hashtags = (pillarHashtags[pillar] || pillarHashtags.growth)
    .split(' ')
    .slice(0, 2)
    .join(' ');
  const series = seriesFor(pillar);
  return `${quote}\n\n${context}\n\nFollow @${brandUsername} for ${series.promise}.\n\n${hashtags} #${brandUsername.replace(/\./g, '')}`;
}
