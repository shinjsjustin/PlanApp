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
