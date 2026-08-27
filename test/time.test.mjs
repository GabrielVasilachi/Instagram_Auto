import test from 'node:test'
import assert from 'node:assert/strict'
import { addDaysAtTime, firstAvailableSlot, scheduledSlots, slotForLocalDate } from '../server/time.mjs'

test('Chisinau local publishing time is converted to UTC', () => {
  assert.equal(slotForLocalDate({ year: 2026, month: 8, day: 27 }, '09:00', 'Europe/Chisinau').toISOString(), '2026-08-27T06:00:00.000Z')
  assert.equal(slotForLocalDate({ year: 2026, month: 1, day: 27 }, '09:00', 'Europe/Chisinau').toISOString(), '2026-01-27T07:00:00.000Z')
})

test('daily slots preserve wall clock time across daylight-saving changes', () => {
  const beforeChange = slotForLocalDate({ year: 2026, month: 3, day: 28 }, '09:00', 'Europe/Chisinau')
  assert.equal(addDaysAtTime(beforeChange, 1, '09:00', 'Europe/Chisinau').toISOString(), '2026-03-29T06:00:00.000Z')
})

test('first available slot moves to tomorrow after the daily time', () => {
  const now = new Date('2026-08-26T18:00:00.000Z')
  assert.equal(firstAvailableSlot('09:00', 'Europe/Chisinau', now).toISOString(), '2026-08-27T06:00:00.000Z')
})

test('Reel schedule creates three daily slots in local time', () => {
  const slots = scheduledSlots({
    times: ['09:00', '15:30', '21:00'],
    timeZone: 'Europe/Chisinau',
    days: 2,
    now: new Date('2026-08-27T04:00:00.000Z'),
  })
  assert.deepEqual(slots.map((slot) => slot.toISOString()), [
    '2026-08-27T06:00:00.000Z',
    '2026-08-27T12:30:00.000Z',
    '2026-08-27T18:00:00.000Z',
    '2026-08-28T06:00:00.000Z',
    '2026-08-28T12:30:00.000Z',
    '2026-08-28T18:00:00.000Z',
  ])
})

test('weekly post schedule only uses selected ISO weekdays', () => {
  const slots = scheduledSlots({
    times: ['11:00'],
    weekdays: [2, 6],
    timeZone: 'Europe/Chisinau',
    days: 7,
    now: new Date('2026-08-24T04:00:00.000Z'),
  })
  assert.deepEqual(slots.map((slot) => slot.toISOString()), [
    '2026-08-25T08:00:00.000Z',
    '2026-08-29T08:00:00.000Z',
  ])
})
