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

const hooks = [
  'Save this for the moment your discipline gets tested.',
  'Read this slowly, then choose the next useful step.',
  'A reminder for the days when progress feels invisible.',
  'Send this to someone building quietly.',
  'Your future self needs this decision today.',
  'Motivation fades. A clear standard stays.',
  'Pause the scroll and remember what you are building.',
  'This is your sign to return to the work.',
  'Keep this close when the easy option gets loud.',
  'One thought for a stronger, quieter day.',
  'You do not need a perfect day. You need the next action.',
  'For everyone choosing progress without applause.',
];

const closers = [
  'Quiet work. Visible results.',
  'Protect the focus. Keep moving forward.',
  'Build the habit, then let the habit build you.',
  'Small proof, repeated daily.',
  'Less noise. More direction.',
  'Keep the promise you made to yourself.',
];

const callsToAction = [
  'Follow @silentforward for daily discipline and perspective.',
  'Save this and come back when you need the reminder.',
  'Share this with someone who refuses to stop.',
  'Follow @silentforward and build quietly with us.',
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
  discipline: '#discipline #consistency #dailyhabits #selfmastery #motivation #silentforward',
  focus: '#focus #deepwork #mentalclarity #productivity #mindset #silentforward',
  resilience: '#resilience #keepgoing #mentalstrength #personalgrowth #motivation #silentforward',
  'self-respect': '#selfrespect #selfworth #boundaries #confidence #mindset #silentforward',
  courage: '#courage #fearlessmindset #takeaction #growthmindset #motivation #silentforward',
  growth: '#personalgrowth #progress #growthmindset #betterself #motivation #silentforward',
  'quiet-confidence':
    '#quietconfidence #confidence #selfbelief #innerstrength #mindset #silentforward',
  purpose: '#purpose #direction #intentionality #focus #personaldevelopment #silentforward',
};

export function captionFor(quote, format, cursor, growth = {}) {
  const pillar = growth.pillar || 'growth';
  const context = pillarContext[pillar] || pillarContext.growth;
  const hashtags = (pillarHashtags[pillar] || pillarHashtags.growth)
    .split(' ')
    .slice(0, 2)
    .join(' ');
  return `${cursor % 2 === 0 ? context : closers[Math.floor(cursor / 2) % closers.length]}${cursor % 5 === 0 ? '\n\nRemember this.' : ''}\n\n${hashtags} #silentforward`;
}
