// Order, filter and timeline geometry for the Chores page. Everything works on
// 'YYYY-MM-DD' keys and does its day maths in UTC so DST cannot shift a day.

const TIMELINE_DAYS = 21;
const DAYS_BEFORE_TODAY = 4;
const SOON_DAYS = 3;
const MONDAY = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FULL = 100;
const DAY_PERCENT = FULL / TIMELINE_DAYS;

export const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'soon', label: 'Due within 3 days' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'never', label: 'Never done' },
];

const toUtc = (key) => {
    const [year, month, day] = key.split('-').map(Number);

    return Date.UTC(year, month - 1, day);
};

const addDays = (key, days) => new Date(toUtc(key) + days * MS_PER_DAY).toISOString().slice(0, 10);

const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);

const clamp = (value) => Math.min(FULL, Math.max(0, value));

const byName = (a, b) => a.name.localeCompare(b.name);

/** Done chores by dueBy then name; never-done chores last by name. A new array. */
export const orderChores = (chores) => {
    const done = chores.filter((c) => c.dueBy).sort(
        (a, b) => a.dueBy.localeCompare(b.dueBy) || byName(a, b)
    );
    const never = chores.filter((c) => !c.dueBy).sort(byName);

    return [...done, ...never];
};

export const filterChores = (chores, filterId, today) => {
    switch (filterId) {
        case 'soon': {
            const last = addDays(today, SOON_DAYS);
            return chores.filter((c) => c.dueBy && c.dueBy >= today && c.dueBy <= last);
        }
        case 'overdue':
            return chores.filter((c) => c.dueBy && c.dueBy < today);
        case 'never':
            return chores.filter((c) => !c.dueBy);
        default:
            return chores;
    }
};

export const filterCounts = (chores, today) => Object.fromEntries(
    FILTERS.map(({ id }) => [id, filterChores(chores, id, today).length])
);

export const timelineRange = (today) => ({
    start: addDays(today, -DAYS_BEFORE_TODAY),
    days: TIMELINE_DAYS,
});

export const dayPercent = (key, range) => (daysBetween(range.start, key) / range.days) * FULL;

/** Today's marker sits in the middle of its day. */
export const nowPercent = (range, today) => dayPercent(today, range) + DAY_PERCENT / 2;

const isMonday = (key) => new Date(toUtc(key)).getUTCDay() === MONDAY;

export const dayMarks = (range) => Array.from({ length: range.days }, (_, i) => {
    const key = addDays(range.start, i);

    return { key, left: dayPercent(key, range), isWeekStart: isMonday(key) };
});

export const weekMarks = (range) => dayMarks(range)
    .filter((mark) => mark.isWeekStart)
    .map(({ key, left }) => ({
        key,
        left,
        label: new Date(toUtc(key)).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
        }),
    }));

const toneFor = (chore, today) => {
    if (today < chore.dueFrom) return 'future';

    return today <= chore.dueBy ? 'open' : 'late';
};

/** The bar for a chore's window, or null if it has never been done. */
export const timelineBar = (chore, range, today) => {
    if (!chore.dueBy) return null;

    const tone = toneFor(chore, today);
    const rawStart = dayPercent(chore.dueFrom, range);
    const rawEnd = dayPercent(chore.dueBy, range) + DAY_PERCENT;

    let left = clamp(rawStart);
    let end = clamp(rawEnd);
    const cutStart = rawStart < 0;
    const cutEnd = rawEnd > FULL;

    // Wholly off one edge: keep a one-day stub so the chore is still visible.
    if (rawEnd <= 0) end = DAY_PERCENT;
    if (rawStart >= FULL) left = FULL - DAY_PERCENT;

    const tailEnd = nowPercent(range, today);
    const tail =
        tone === 'late'
            ? { left: clamp(rawEnd), width: clamp(tailEnd) - clamp(rawEnd) }
            : null;

    return { tone, left, width: end - left, cutStart, cutEnd, tail };
};
