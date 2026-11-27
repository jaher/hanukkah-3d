/**
 * Universal Hebrew Calendar & Hanukkah Night Lighting Calculator (All Years)
 *
 * Computes Hanukkah dynamically for ANY Gregorian year directly from the
 * mathematical Hebrew calendar (25 Kislev through 2/3 Tevet, 8 nights):
 * - Exact Molad Tishrei & all four Dehiyyot (postponement rules) per Dershowitz & Reingold
 * - Exact Marcheshvan length (29 or 30 days) for deficient, regular, and complete years
 * - Night 1 begins at sunset (~16:30 local) on the evening of 25 Kislev (the Gregorian
 *   evening immediately preceding the daytime date of 25 Kislev) and runs 8 consecutive nights,
 *   including years where Hanukkah spans late December into early January (e.g., 2024–2025, 2027–2028).
 * - Shabbat is computed strictly from the calendar Date (Friday evening / Saturday before nightfall).
 * - Zero hardcoded years or dates anywhere.
 */

const SUNSET_HOUR = 16;
const SUNSET_MINUTE = 30;
const NIGHTFALL_END_HOUR = 18;

// Rata Die (R.D. 1 = Jan 1, 1 CE proleptic Gregorian) of 1 Tishrei, Year 1 AM
const HEBREW_EPOCH_RD = -1373427;

/** Exact floor division for positive and negative integers. */
function floorDiv(a, b) {
  return Math.floor(a / b);
}

/** Exact positive modulo. */
function mod(a, b) {
  return ((a % b) + b) % b;
}

/**
 * Days elapsed from Hebrew epoch to Molad Tishrei of Hebrew year `hYear`,
 * including Dehiyah 1 (Molad Zaken) and Dehiyah 2 (Lo ADU Rosh).
 */
function hebrewCalendarElapsedDays(hYear) {
  const monthsElapsed = floorDiv(235 * hYear - 234, 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  let day = monthsElapsed * 29 + floorDiv(partsElapsed, 25920);
  if (mod(3 * (day + 1), 7) < 3) {
    day += 1;
  }
  return day;
}

/** Dehiyah 3 (GTRD: 356-day non-leap) and Dehiyah 4 (BTU ThKPT: 382-day post-leap) delays. */
function hebrewYearDelay(hYear) {
  const ny0 = hebrewCalendarElapsedDays(hYear - 1);
  const ny1 = hebrewCalendarElapsedDays(hYear);
  const ny2 = hebrewCalendarElapsedDays(hYear + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

/** Exact Rata Die (R.D.) of 1 Tishrei for Hebrew year `hYear`. */
export function tishrei1RD(hYear) {
  return HEBREW_EPOCH_RD + hebrewCalendarElapsedDays(hYear) + hebrewYearDelay(hYear);
}

/** Convert a Rata Die integer to a Gregorian { year, month (0-based), day } triple. */
function rdToGregorian(rd) {
  const d0 = rd - 1;
  const n400 = floorDiv(d0, 146097);
  const d1 = mod(d0, 146097);
  const n100 = floorDiv(d1, 36524);
  const d2 = mod(d1, 36524);
  const n4 = floorDiv(d2, 1461);
  const d3 = mod(d2, 1461);
  const n1 = floorDiv(d3, 365);
  const year = 400 * n400 + 100 * n100 + 4 * n4 + n1 + (n100 === 4 || n1 === 4 ? 0 : 1);

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const jan1RD =
    1 +
    365 * (year - 1) +
    floorDiv(year - 1, 4) -
    floorDiv(year - 1, 100) +
    floorDiv(year - 1, 400);
  const priorDays = rd - jan1RD;
  const mar1RD = jan1RD + (isLeap ? 60 : 59);
  const correction = rd < mar1RD ? 0 : isLeap ? 1 : 2;
  const month1Based = floorDiv(12 * (priorDays + correction) + 373, 367);
  const monthStartOffset = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month1Based - 1] + (month1Based > 2 && isLeap ? 1 : 0);
  const day = priorDays - monthStartOffset + 1;
  return { year, month: month1Based - 1, day };
}

/**
 * Compute the Rata Die of daytime 25 Kislev for Hebrew year `hYear`.
 * (Night 1 of Hanukkah begins at sunset on the Gregorian evening `kislev25RD - 1`.)
 */
export function kislev25RD(hYear) {
  const t1 = tishrei1RD(hYear);
  const nextT1 = tishrei1RD(hYear + 1);
  const yearDays = nextT1 - t1;
  // Tishrei always has 30 days; Marcheshvan has 30 days iff the year is complete (355 or 385 days)
  const cheshvanDays = yearDays % 10 === 5 ? 30 : 29;
  return t1 + 30 + cheshvanDays + 24;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShortDate(date) {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatMonthDay(date) {
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

const scheduleCache = new Map();

/**
 * Compute the complete 8-night Hanukkah schedule for the season whose Night 1 falls in
 * Gregorian year `gregorianYear` (corresponding to Hebrew year `gregorianYear + 3761`).
 * @param {number} gregorianYear
 */
export function getHanukkahSchedule(gregorianYear) {
  const y = Math.round(gregorianYear);
  if (scheduleCache.has(y)) return scheduleCache.get(y);

  const hebrewYear = y + 3761;
  const k25RD = kislev25RD(hebrewYear);
  // Night 1 starts at sunset on the evening BEFORE daytime 25 Kislev (k25RD - 1)
  const night1RD = k25RD - 1;

  const nightStarts = [null];
  const nightDates = [null];
  const nightLabels = [null];

  for (let n = 1; n <= 8; n++) {
    const g = rdToGregorian(night1RD + (n - 1));
    const startDt = new Date(g.year, g.month, g.day, SUNSET_HOUR, SUNSET_MINUTE, 0, 0);
    const eveDt = new Date(g.year, g.month, g.day, 19, 0, 0, 0);
    nightStarts.push(startDt);
    nightDates.push(eveDt);
    nightLabels.push(formatShortDate(eveDt));
  }

  // Holiday concludes at nightfall on the day after Night 8 (night1RD + 8)
  const endG = rdToGregorian(night1RD + 8);
  const holidayEnd = new Date(endG.year, endG.month, endG.day, NIGHTFALL_END_HOUR, 0, 0, 0);

  const firstNightDate = nightDates[1];
  const rangeLabel =
    firstNightDate.getFullYear() === holidayEnd.getFullYear()
      ? firstNightDate.getMonth() === holidayEnd.getMonth()
        ? `${MONTHS_SHORT[firstNightDate.getMonth()]} ${firstNightDate.getDate()}–${holidayEnd.getDate()}, ${y}`
        : `${formatMonthDay(firstNightDate)}–${formatMonthDay(holidayEnd)}, ${y}`
      : `${formatMonthDay(firstNightDate)}, ${firstNightDate.getFullYear()}–${formatMonthDay(holidayEnd)}, ${holidayEnd.getFullYear()}`;

  const schedule = {
    gregorianYear: y,
    hebrewYear,
    nightStarts,
    nightDates,
    nightLabels,
    holidayEnd,
    rangeLabel,
  };
  scheduleCache.set(y, schedule);
  return schedule;
}

/**
 * Determine which Hanukkah season year applies to `now` (handling early-January spillover
 * from a late-December Hanukkah such as Dec 25, 2024 – Jan 2, 2025).
 * @param {Date} now
 */
export function resolveHanukkahSeasonYear(now = new Date()) {
  const y = now.getFullYear();
  const prevSched = getHanukkahSchedule(y - 1);
  if (now.getTime() >= prevSched.nightStarts[1].getTime() && now.getTime() < prevSched.holidayEnd.getTime()) {
    return y - 1;
  }
  return y;
}

/**
 * Return the Gregorian evening Date for Hanukkah Night N (1..8) in `seasonYear` (defaults to current season),
 * or null for night 0.
 * @param {number} nightCount
 * @param {number|Date} [seasonOrDate]
 */
export function getHanukkahNightDate(nightCount, seasonOrDate = new Date()) {
  const n = Math.round(nightCount);
  if (n < 1 || n > 8) return null;
  const seasonYear =
    typeof seasonOrDate === 'number'
      ? seasonOrDate
      : resolveHanukkahSeasonYear(seasonOrDate instanceof Date ? seasonOrDate : new Date());
  const sched = getHanukkahSchedule(seasonYear);
  return sched.nightDates[n] ? new Date(sched.nightDates[n].getTime()) : null;
}

/**
 * Determine dynamically from the computed calendar Date whether the selected night (or live Auto time)
 * falls on Shabbat (Friday evening / Saturday before nightfall). Never hardcodes night numbers or years.
 * @param {number} nightCount
 * @param {'auto'|'manual'} mode
 * @param {Date} [now]
 * @param {number} [seasonYear]
 */
export function isShabbatForSelection(nightCount, mode = 'manual', now = new Date(), seasonYear = null) {
  if (mode === 'auto') {
    const day = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const sunsetMins = SUNSET_HOUR * 60 + SUNSET_MINUTE;
    if (day === 5 && mins >= sunsetMins) return true;
    if (day === 6 && now.getHours() < NIGHTFALL_END_HOUR) return true;
    return false;
  }
  const ref = typeof seasonYear === 'number' ? seasonYear : now;
  const nightDate = getHanukkahNightDate(nightCount, ref);
  if (!nightDate) return false;
  return nightDate.getDay() === 5; // Friday evening = Shabbat!
}

/**
 * Compute the active Hanukkah night (0..8) and full schedule metadata for ANY Date in ANY year.
 * @param {Date} [now]
 */
export function computeHanukkahNight(now = new Date()) {
  const seasonYear = resolveHanukkahSeasonYear(now);
  const sched = getHanukkahSchedule(seasonYear);
  const t = now.getTime();
  const night1Start = sched.nightStarts[1];

  if (t < night1Start.getTime()) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfNight1 = new Date(night1Start.getFullYear(), night1Start.getMonth(), night1Start.getDate()).getTime();
    const calDays = Math.round((startOfNight1 - startOfToday) / (1000 * 60 * 60 * 24));
    const md = formatMonthDay(night1Start);
    let statusText;
    if (calDays <= 0) {
      statusText = `Hanukkah ${seasonYear} begins this evening (${md})`;
    } else if (calDays === 1) {
      statusText = `Hanukkah ${seasonYear} begins tomorrow evening (${md})`;
    } else {
      statusText = `Hanukkah ${seasonYear} begins ${md} (${calDays} days away)`;
    }
    return {
      night: 0,
      seasonYear,
      hebrewYear: sched.hebrewYear,
      schedule: sched,
      isHanukkah: false,
      phase: 'before',
      statusText,
    };
  }

  if (t >= sched.holidayEnd.getTime()) {
    return {
      night: 0,
      seasonYear,
      hebrewYear: sched.hebrewYear,
      schedule: sched,
      isHanukkah: false,
      phase: 'after',
      statusText: `Hanukkah ${seasonYear} (${sched.rangeLabel}) · Shamash lit`,
    };
  }

  let activeNight = 1;
  for (let n = 1; n <= 8; n++) {
    if (t >= sched.nightStarts[n].getTime()) {
      activeNight = n;
    }
  }

  return {
    night: activeNight,
    seasonYear,
    hebrewYear: sched.hebrewYear,
    schedule: sched,
    isHanukkah: true,
    phase: 'during',
    statusText: `Tonight: Night ${activeNight} of Hanukkah · ${sched.nightLabels[activeNight]}`,
  };
}
