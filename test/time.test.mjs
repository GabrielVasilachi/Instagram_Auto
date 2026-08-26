import test from 'node:test'
import assert from 'node:assert/strict'
import { addDaysAtTime, firstAvailableSlot, slotForLocalDate } from '../server/time.mjs'

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
