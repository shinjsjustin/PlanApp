'use strict';

// Lays a day's bookings out with real drive time before each booking at a new place.

const DAY_START_MINUTES = 480;
const FIRST_STOP_LEAD_MINUTES = 60;
const STEP_MINUTES = 5;
const UNAVAILABLE_DRIVE_MINUTES = 15;
const SECONDS_PER_MINUTE = 60;

const driveMinutesOf = (answer) => {
    if (answer.status !== 'ok') return UNAVAILABLE_DRIVE_MINUTES;
    const minutes = answer.durationSeconds / SECONDS_PER_MINUTE;
    return Math.ceil(minutes / STEP_MINUTES) * STEP_MINUTES;
};

const offsetMinutesAt = (instantMs, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    }).formatToParts(new Date(instantMs));
    const get = (type) => Number(parts.find((part) => part.type === type).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return (asUtc - Math.floor(instantMs / 60000) * 60000) / 60000;
};

// The wall-clock minute is read as local time in the zone; two passes settle across a DST change.
const departAtFor = (dateKey, minutes, timeZone) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const wallMs = Date.UTC(year, month - 1, day, 0, minutes);
    const first = wallMs - offsetMinutesAt(wallMs, timeZone) * 60000;
    return new Date(wallMs - offsetMinutesAt(first, timeZone) * 60000);
};

const relayDay = async ({ bookings, places, startPlaceId, driveMinutes }) => {
    const kindOf = new Map(places.map((place) => [place.id, place.kind]));
    const ordered = [...bookings].sort((a, b) => a.startMinutes - b.startMinutes);
    const result = [];
    let cursor = DAY_START_MINUTES;
    let lastPlaceId = null;
    let hasPlaced = false;

    for (const booking of ordered) {
        let drive = 0;
        if (booking.placeId != null) {
            const isFirst = !hasPlaced;
            const fromPlaceId = isFirst ? startPlaceId : lastPlaceId;
            const skipsDrive =
                fromPlaceId == null ||
                fromPlaceId === booking.placeId ||
                (isFirst && kindOf.get(booking.placeId) === 'work');
            if (!skipsDrive) {
                const departMinutes = isFirst
                    ? Math.max(DAY_START_MINUTES, booking.startMinutes - FIRST_STOP_LEAD_MINUTES)
                    : cursor;
                drive = await driveMinutes({ fromPlaceId, toPlaceId: booking.placeId, departMinutes });
            }
            hasPlaced = true;
            lastPlaceId = booking.placeId;
        }

        const startMinutes = Math.max(booking.startMinutes, cursor + drive);
        const laid = startMinutes === booking.startMinutes ? booking : { ...booking, startMinutes };
        cursor = startMinutes + booking.durationMinutes;
        result.push(laid);
    }

    return result;
};

module.exports = { relayDay, driveMinutesOf, departAtFor };
