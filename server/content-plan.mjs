export const REEL_TIMES = ['09:00', '15:30', '21:00']
export const POST_TIME = '11:00'
export const POST_WEEKDAYS = [2, 6]

export const CONTENT_PILLARS = [
  'discipline', 'focus', 'consistency', 'self-respect', 'resilience', 'deep-work',
  'quiet-confidence', 'habits', 'purpose', 'mental-strength', 'growth', 'courage',
]

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
]

const closers = [
  'Quiet work. Visible results.',
  'Protect the focus. Keep moving forward.',
  'Build the habit, then let the habit build you.',
  'Small proof, repeated daily.',
  'Less noise. More direction.',
  'Keep the promise you made to yourself.',
]

const callsToAction = [
  'Follow @silentforward for daily discipline and perspective.',
  'Save this and come back when you need the reminder.',
  'Share this with someone who refuses to stop.',
  'Follow @silentforward and build quietly with us.',
]

const hashtagSets = [
  '#motivation #discipline #mindset #selfimprovement #consistency #focus #growthmindset #dailyquotes #silentforward',
  '#motivationalreels #reelsmotivation #disciplineequalsfreedom #mentalstrength #keepgoing #personalgrowth #silentforward',
  '#deepwork #focusmode #productivity #habits #selfmastery #quietconfidence #purpose #silentforward',
  '#motivationdaily #mindsetshift #resilience #positivehabits #goals #successmindset #progress #silentforward',
  '#selfrespect #standards #confidence #innerstrength #courage #bettereveryday #mindsetmatters #silentforward',
  '#consistencyiskey #hardwork #dailyfocus #momentum #growth #determination #nevergiveup #silentforward',
  '#stoicmindset #calmstrength #discipline #focusonyourself #levelup #mentalclarity #silentforward',
  '#morningmotivation #dailyinspiration #goodhabits #intentionality #selfgrowth #forward #silentforward',
]

export function captionFor(quote, format, cursor) {
  const hook = hooks[cursor % hooks.length]
  const closer = closers[Math.floor(cursor / 2) % closers.length]
  const callToAction = callsToAction[Math.floor(cursor / 3) % callsToAction.length]
  const tagOffset = format === 'reel' ? 2 : 0
  const hashtags = hashtagSets[(cursor + tagOffset) % hashtagSets.length]
  return `${hook}\n\n${quote}\n\n${closer} ${callToAction}\n\n${hashtags}`
}
