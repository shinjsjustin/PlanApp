// Pure rules for the Rhythm page: week, zone and edit math, before any component draws it.
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60000;
const DAYS_IN_WEEK = 7;
const VISIBLE_GATE_STATES = ['open', 'held'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n) => String(n).padStart(2, '0');
const keyOfUtc = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const utcOfKey = (key) => {
    const [year, month, day] = key.split('-').map(Number);

    return new Date(Date.UTC(year, month - 1, day));
};

/** Wall-clock parts of an instant in the zone, via Intl so DST is handled. */
const wallParts = (instant, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(instant);
    const value = (type) => Number(parts.find((p) => p.type === type).value);

    return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
};

/** Wall time as minutes on a zone-free timeline, so two instants compare by what the clock showed. */
const wallMinutes = (instant, timeZone) => {
    const { year, month, day, hour, minute } = wallParts(instant, timeZone);

    return Date.UTC(year, month - 1, day, hour, minute) / MS_PER_MINUTE;
};

/** The Monday (YYYY-MM-DD) of the week containing now in the zone. */
export const weekStart = (now, timeZone) => {
    const { year, month, day } = wallParts(now, timeZone);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + DAYS_IN_WEEK - 1) % DAYS_IN_WEEK));

    return keyOfUtc(date);
};

export const addWeeks = (key, weeks) => {
    const date = utcOfKey(key);
    date.setUTCDate(date.getUTCDate() + weeks * DAYS_IN_WEEK);

    return keyOfUtc(date);
};

const minutesOfTime = (time) => {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * MINUTES_PER_HOUR + minutes;
};

const daysOf = (anchor) => (anchor.days === 'daily' ? DAYS : anchor.days);

/** Each weekday mapped to the anchors on it, earliest first. */
export const anchorsByDay = (anchors) => {
    const enriched = anchors
        .map((anchor) => ({ ...anchor, minutes: minutesOfTime(anchor.time), disabled: !anchor.enabled }))
        .sort((a, b) => a.minutes - b.minutes);

    return Object.fromEntries(DAYS.map((day) => [day, enriched.filter((a) => daysOf(a).includes(day))]));
};

/** Per-day pieces of the open or held gates that touch the week, in the zone's wall time. */
export const gateSegments = (gates, weekKey, timeZone) => {
    const weekAbs = utcOfKey(weekKey).getTime() / MS_PER_MINUTE;
    const weekDays = DAYS.map((day, i) => ({ day, startAbs: weekAbs + i * MINUTES_PER_DAY }));

    return gates
        .filter((gate) => VISIBLE_GATE_STATES.includes(gate.state))
        .flatMap((gate) => {
            const opens = wallMinutes(new Date(gate.opensAt), timeZone);
            const closes = wallMinutes(new Date(gate.closesAt), timeZone);

            return weekDays
                .filter(({ startAbs }) => opens < startAbs + MINUTES_PER_DAY && closes > startAbs)
                .map(({ day, startAbs }) => ({
                    gate,
                    day,
                    startMin: Math.max(opens - startAbs, 0),
                    endMin: Math.min(closes - startAbs, MINUTES_PER_DAY),
                    closes: closes - startAbs <= MINUTES_PER_DAY,
                }));
        });
};

export const zoneLabel = (stored, browserZone) => stored || `${browserZone} (this device)`;

export const draftOf = (anchor) => ({ time: anchor.time, days: [...daysOf(anchor)], enabled: anchor.enabled });

/** Only the fields the draft changed: { body }, { body: null } when none, or { error }. */
export const patchBodyOf = (anchor, draft) => {
    if (!TIME_PATTERN.test(draft.time)) return { error: 'Enter a time as HH:MM, 24 hour.' };
    if (draft.days.length === 0) return { error: 'Pick at least one day.' };

    const chosen = DAYS.filter((day) => draft.days.includes(day));
    const before = daysOf(anchor);
    const daysChanged = chosen.length !== before.length || chosen.some((day) => !before.includes(day));

    const body = {
        ...(draft.time !== anchor.time && { time: draft.time }),
        ...(daysChanged && { days: chosen.length === DAYS_IN_WEEK ? 'daily' : chosen }),
        ...(draft.enabled !== anchor.enabled && { enabled: draft.enabled }),
    };

    return { body: Object.keys(body).length ? body : null };
};
