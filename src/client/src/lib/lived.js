// Pure rules for the Lived view: what a day looked like, before any component draws it.
import { todayKey, previousDateKey, nextDateKey } from './dates';

export const CATEGORIES = [
    { key: 'god', label: 'God' },
    { key: 'family', label: 'Family' },
    { key: 'work', label: 'Work' },
    { key: 'building', label: 'Building' },
    { key: 'rest', label: 'Rest' },
    { key: 'sleep', label: 'Sleep' },
    { key: 'drive', label: 'Drive' },
];

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const DAY_ROLLOVER_HOUR = 4;
const DAYS_IN_WEEK = 7;
const SATURDAY = 6;
const COVERED_SLIVER_MINUTES = 4;
const COLOUR_ONLY_BELOW_MINUTES = 20;
const TITLE_LINE_PX = 18;
const DETAIL_LINE_PX = 36;
const WINDOW_START = 360;
const WINDOW_END = MINUTES_PER_DAY;
const VIEW_KEY = 'calendarView';
const VIEWS = ['lived', 'plan'];

/** The lived day rolls over at 04:00, so 01:00 still belongs to yesterday. */
export const livedTodayKey = (now = new Date()) => {
    const key = todayKey(now);

    return now.getHours() < DAY_ROLLOVER_HOUR ? previousDateKey(key) : key;
};

/** Seven keys, Saturday to Friday, of the week containing the date. */
export const weekOf = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const daysSinceSaturday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() - SATURDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK;

    let first = dateKey;
    for (let i = 0; i < daysSinceSaturday; i += 1) first = previousDateKey(first);

    const keys = [first];
    while (keys.length < DAYS_IN_WEEK) keys.push(nextDateKey(keys[keys.length - 1]));

    return keys;
};

/**
 * One lane from overlapping moments: each starts where the previous one ended.
 * A moment wholly under an earlier one keeps a sliver so it stays tappable.
 */
export const laneBlocks = (moments) => {
    const sorted = [...moments].sort((a, b) => a.startMinutes - b.startMinutes);
    let cursor = -Infinity;

    return sorted.map((moment) => {
        const end = moment.startMinutes + moment.durationMinutes;
        const covered = end <= cursor;
        const startMinutes = Math.max(moment.startMinutes, cursor);
        const durationMinutes = covered ? COVERED_SLIVER_MINUTES : end - startMinutes;
        cursor = startMinutes + durationMinutes;

        return { ...moment, startMinutes, durationMinutes, covered };
    });
};

/** How much of a block's text fits: nothing, the title, or title and detail. */
export const labelMode = (durationMinutes, heightPx) => {
    if (durationMinutes < COLOUR_ONLY_BELOW_MINUTES || heightPx < TITLE_LINE_PX) return 'colour';

    return heightPx >= DETAIL_LINE_PX ? 'title-detail' : 'title';
};

/** 06:00-24:00, stretched to whole hours so every moment is inside. */
export const timelineRange = (moments) => {
    const starts = moments.map((x) => x.startMinutes);
    const ends = moments.map((x) => x.startMinutes + x.durationMinutes);

    return {
        start: Math.floor(Math.min(WINDOW_START, ...starts) / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
        end: Math.ceil(Math.max(WINDOW_END, ...ends) / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
    };
};

/** Week-bar pieces as percent offsets of 06:00-24:00; moments outside it are dropped. */
export const weekBarSegments = (moments) => {
    const span = WINDOW_END - WINDOW_START;

    return moments.flatMap((moment) => {
        const start = Math.max(moment.startMinutes, WINDOW_START);
        const end = Math.min(moment.startMinutes + moment.durationMinutes, WINDOW_END);
        if (end <= start) return [];

        return [{
            id: moment.id,
            category: moment.category,
            left: ((start - WINDOW_START) / span) * 100,
            width: ((end - start) / span) * 100,
        }];
    });
};

/** HH:MM, wrapping past midnight (1500 is 01:00). */
export const formatMinutes = (minutes) => {
    const wrapped = minutes % MINUTES_PER_DAY;
    const pad = (n) => String(n).padStart(2, '0');

    return `${pad(Math.floor(wrapped / MINUTES_PER_HOUR))}:${pad(wrapped % MINUTES_PER_HOUR)}`;
};

export const readCalendarView = (isPhone) => {
    const stored = localStorage.getItem(VIEW_KEY);
    if (VIEWS.includes(stored)) return stored;

    return isPhone ? 'lived' : 'plan';
};

export const saveCalendarView = (view) => localStorage.setItem(VIEW_KEY, view);
