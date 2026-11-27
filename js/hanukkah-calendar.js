/**
 * Hanukkah 2026 Calendar & Night Lighting Calculator
 *
 * Hanukkah 2026 schedule:
 * - Night 1: Evening of Friday, Dec 4, 2026 (sunset ~16:30 local time)
 * - Night 2: Evening of Saturday, Dec 5, 2026
 * - Night 3: Evening of Sunday, Dec 6, 2026
 * - Night 4: Evening of Monday, Dec 7, 2026
 * - Night 5: Evening of Tuesday, Dec 8, 2026
 * - Night 6: Evening of Wednesday, Dec 9, 2026
 * - Night 7: Evening of Thursday, Dec 10, 2026
 * - Night 8: Evening of Friday, Dec 11, 2026 through nightfall (~18:00) Saturday, Dec 12, 2026.
 *
 * The shamash is lit at ALL times. On Night N (1..8), N candles + shamash are lit.
 * Candles are placed right-to-left (indices 1..N) and lit left-to-right (N down to 1).
 */

const SUNSET_HOUR = 16;
const SUNSET_MINUTE = 30;
const NIGHTFALL_END_HOUR = 18;

export const HANUKKAH_2026_NIGHT_DATES = [
  null,
  'Fri, Dec 4, 2026',
  'Sat, Dec 5, 2026',
  'Sun, Dec 6, 2026',
  'Mon, Dec 7, 2026',
  'Tue, Dec 8, 2026',
  'Wed, Dec 9, 2026',
  'Thu, Dec 10, 2026',
  'Fri, Dec 11, 2026',
];

/**
 * Compute the active Hanukkah 2026 night (0..8) from any Date object.
 * @param {Date} now
 */
export function computeHanukkahNight(now = new Date()) {
  // Construct local evening transition timestamps for Dec 4..11, 2026 and end Dec 12, 2026
  const nightStarts = [];
  for (let n = 1; n <= 8; n++) {
    nightStarts.push(new Date(2026, 11, 3 + n, SUNSET_HOUR, SUNSET_MINUTE, 0, 0)); // month 11 = December
  }
  const holidayEnd = new Date(2026, 11, 12, NIGHTFALL_END_HOUR, 0, 0, 0);

  const t = now.getTime();
  if (t < nightStarts[0].getTime()) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDec4 = new Date(2026, 11, 4).getTime();
    const calDays = Math.round((startOfDec4 - startOfToday) / (1000 * 60 * 60 * 24));
    let statusText;
    if (calDays <= 0) {
      statusText = 'Hanukkah 2026 begins this evening (Dec 4)';
    } else if (calDays === 1) {
      statusText = 'Hanukkah 2026 begins tomorrow evening (Dec 4)';
    } else {
      statusText = `Hanukkah 2026 begins Dec 4 (${calDays} days away)`;
    }
    return {
      night: 0,
      isHanukkah: false,
      phase: 'before',
      statusText,
    };
  }

  if (t >= holidayEnd.getTime()) {
    return {
      night: 0,
      isHanukkah: false,
      phase: 'after',
      statusText: 'Hanukkah 2026 (Dec 4–12) · Shamash lit',
    };
  }

  let activeNight = 1;
  for (let i = 0; i < nightStarts.length; i++) {
    if (t >= nightStarts[i].getTime()) {
      activeNight = i + 1;
    }
  }

  return {
    night: activeNight,
    isHanukkah: true,
    phase: 'during',
    statusText: `Tonight: Night ${activeNight} of Hanukkah · ${HANUKKAH_2026_NIGHT_DATES[activeNight]}`,
  };
}
