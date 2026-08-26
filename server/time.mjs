function partsAt(date, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))

  return values
}

function localPartsToUtc(parts, timeZone) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0)
  let result = new Date(desired)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsAt(result, timeZone)
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    result = new Date(result.getTime() + desired - actualAsUtc)
  }

  return result
}

function addCalendarDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function slotForLocalDate(dateParts, time, timeZone) {
  const [hour, minute] = String(time).split(':').map(Number)
  return localPartsToUtc({ ...dateParts, hour, minute, second: 0 }, timeZone)
}

export function firstAvailableSlot(time, timeZone, now = new Date(), forceTomorrow = false) {
  const today = partsAt(now, timeZone)
  let dateParts = { year: today.year, month: today.month, day: today.day }
  let slot = slotForLocalDate(dateParts, time, timeZone)

  if (forceTomorrow || slot <= now) {
    dateParts = addCalendarDays(dateParts, 1)
    slot = slotForLocalDate(dateParts, time, timeZone)
  }

  return slot
}

export function addDaysAtTime(date, amount, time, timeZone) {
  const current = partsAt(date, timeZone)
  return slotForLocalDate(addCalendarDays(current, amount), time, timeZone)
}
