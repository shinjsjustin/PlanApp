// Says which drives a day needs: one leg into each placed booking.

export const DAY_START_MINUTES = 480;
const FIRST_STOP_LEAD_MINUTES = 60;
const STEP_MINUTES = 5;
const UNAVAILABLE_DRIVE_MINUTES = 15;
const SECONDS_PER_MINUTE = 60;

export const driveMinutesOf = (answer) => {
    if (answer.status !== 'ok') return UNAVAILABLE_DRIVE_MINUTES;
    return Math.ceil(answer.durationSeconds / SECONDS_PER_MINUTE / STEP_MINUTES) * STEP_MINUTES;
};

export const normalize = (text) =>
    String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

export const matchPlace = (location, places) => {
    const where = normalize(location);
    if (!where) return null;

    const matches = places
        .map((place) => ({ place, address: normalize(place.address) }))
        .filter(({ address }) => address && where.includes(address))
        .sort((a, b) => b.address.length - a.address.length);

    return matches.length ? matches[0].place : null;
};

const departAtFor = (date, minutes) => {
    const [year, month, day] = date.split('-').map(Number);

    return new Date(year, month - 1, day, 0, minutes).toISOString();
};

const timing = ({ startMinutes, durationMinutes }) => ({
    startMinutes,
    endMinutes: startMinutes + durationMinutes,
});

const stopsFor = (items, places) =>
    items
        .flatMap((item) => {
            const place = places.find((candidate) => candidate.id === item.placeId);

            return place ? [{ key: `item-${item.id}`, place, ...timing(item) }] : [];
        })
        .sort((a, b) => a.startMinutes - b.startMinutes);

export const legsForDay = ({ date, items, places, startPlaceId }) =>
    stopsFor(items, places).flatMap((stop, index, stops) => {
        const previous = stops[index - 1];
        const fromPlaceId = previous ? previous.place.id : startPlaceId;
        if (fromPlaceId == null || fromPlaceId === stop.place.id) return [];
        if (!previous && stop.place.kind === 'work') return [];

        const departMinutes = previous
            ? previous.endMinutes
            : Math.max(DAY_START_MINUTES, stop.startMinutes - FIRST_STOP_LEAD_MINUTES);

        return [
            {
                key: stop.key,
                fromPlaceId,
                toPlaceId: stop.place.id,
                startMinutes: stop.startMinutes,
                departAt: departAtFor(date, departMinutes),
            },
        ];
    });
