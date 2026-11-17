// Which Rhythm anchors and gate closes land on one calendar date.
import { DAYS, weekStart, gateSegments } from './rhythmWeek';

const MINUTES_PER_HOUR = 60;

const pad = (n) => String(n).padStart(2, '0');
const timeOfMinutes = (minutes) => `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;

const anchorMarker = (anchor) => {
    const [hours, minutes] = anchor.time.split(':').map(Number);

    return { key: `anchor:${anchor.id}`, kind: 'anchor', minutes: hours * MINUTES_PER_HOUR + minutes, title: anchor.title, time: anchor.time };
};

const gateMarker = ({ gate, endMin }) => ({
    key: `gate:${gate.id}`, kind: 'gate', minutes: endMin, title: gate.title, time: timeOfMinutes(endMin),
});

/** Markers on dateKey (YYYY-MM-DD), earliest first, in the stored zone else the browser's. */
export const markersForDate = (rhythm, dateKey, browserZone) => {
    if (!dateKey || !rhythm) return [];

    const zone = rhythm.timeZone || browserZone;
    const noon = new Date(`${dateKey}T12:00:00Z`);
    const day = DAYS[(noon.getUTCDay() + DAYS.length - 1) % DAYS.length];
    const anchors = rhythm.anchors
        .filter((a) => a.enabled && (a.days === 'daily' || a.days.includes(day)))
        .map(anchorMarker);
    const gates = gateSegments(rhythm.gates, weekStart(noon, 'UTC'), zone)
        .filter((segment) => segment.day === day && segment.closes)
        .map(gateMarker);

    return [...anchors, ...gates].sort((a, b) => a.minutes - b.minutes);
};
