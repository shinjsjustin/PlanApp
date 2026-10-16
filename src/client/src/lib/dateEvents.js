// Turns the server's raw Google events into the blocks EventLayer and
// AllDayEvents draw, for a date that has no calendar day record.

const MINUTE_MS = 60000;
const DAY_MINUTES = 1440;
const NO_TITLE = '(No title)';

const localMidnight = (dateKey, dayOffset = 0) => {
    const [year, month, day] = dateKey.split('-').map(Number);

    return new Date(year, month - 1, day + dayOffset).getTime();
};

const allDayBlock = (event, dateKey) => {
    // The end date is exclusive, as Google sends it.
    if (dateKey < event.start || dateKey >= event.end) return [];

    return [{ allDay: true, startMinutes: 0, durationMinutes: DAY_MINUTES }];
};

const timedBlock = (event, dateKey) => {
    const dayStart = localMidnight(dateKey);
    const from = Math.max(Date.parse(event.start), dayStart);
    const to = Math.min(Date.parse(event.end), localMidnight(dateKey, 1));
    if (to <= from) return [];

    return [
        {
            allDay: false,
            startMinutes: Math.round((from - dayStart) / MINUTE_MS),
            durationMinutes: Math.round((to - from) / MINUTE_MS),
        },
    ];
};

export const blocksForDate = (events, dateKey) =>
    events.flatMap((event) =>
        (event.allDay ? allDayBlock(event, dateKey) : timedBlock(event, dateKey)).map((block) => ({
            id: event.id,
            title: event.summary || NO_TITLE,
            ...block,
        }))
    );
