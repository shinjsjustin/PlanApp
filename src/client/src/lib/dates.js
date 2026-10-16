// Dates as the interface writes them, which is short: a finished to-do is dated
// in the margin of the DONE group, where it is a reminder rather than a record.

const DAYS_IN_WEEK = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * When a to-do was ticked, in as few characters as still say it: "Mon" for
 * something finished in the last week, "12 Mar" for anything older, and null for
 * a to-do that carries no stamp at all.
 *
 * The week is the useful window — "Mon" means this week, and by the time it
 * could mean last Monday too the date is the clearer answer. Anything that does
 * not parse comes back null rather than as "Invalid Date": a missing stamp is a
 * blank margin, never a broken row.
 *
 * `now` is injectable so a test can date a row without waiting for Tuesday.
 */
export const completedOnLabel = (completedAt, now = new Date()) => {
    if (!completedAt) return null;

    const completed = new Date(completedAt);
    if (Number.isNaN(completed.getTime())) return null;

    const daysAgo = (now.getTime() - completed.getTime()) / MILLISECONDS_PER_DAY;

    // A stamp in the future is a clock disagreeing, not a plan; it reads as
    // recent rather than as a date, which is the less alarming of the two.
    if (daysAgo < DAYS_IN_WEEK) {
        return completed.toLocaleDateString(undefined, { weekday: 'short' });
    }

    return completed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Today as the server stores a day: 'YYYY-MM-DD' in the machine's own zone. */
export const todayKey = (now = new Date()) =>
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

const keyToUtc = (key) => {
    const [year, month, day] = key.split('-').map(Number);

    return new Date(Date.UTC(year, month - 1, day));
};

/** The day after a 'YYYY-MM-DD' key. UTC arithmetic, so a DST change cannot skip or repeat a day. */
export const nextDateKey = (key) => {
    const next = keyToUtc(key);
    next.setUTCDate(next.getUTCDate() + 1);

    return next.toISOString().slice(0, 10);
};

/** The day before a 'YYYY-MM-DD' key; the mirror of nextDateKey. */
export const previousDateKey = (key) => {
    const previous = keyToUtc(key);
    previous.setUTCDate(previous.getUTCDate() - 1);

    return previous.toISOString().slice(0, 10);
};

/** "Thu 15 Oct". Formatted in UTC because the key is already a calendar date, not an instant. */
export const dayLabel = (key) => {
    if (!key) return null;

    return keyToUtc(key).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    });
};
