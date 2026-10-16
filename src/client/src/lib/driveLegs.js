// Says which drives a day needs: one leg into each stop that has a known place.

const FIRST_STOP_LEAD_MINUTES = 60;

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

const stopsFor = (items, events, places) => {
    const itemStops = items.flatMap((item) => {
        const place = places.find((candidate) => candidate.id === item.placeId);

        return place ? [{ key: `item-${item.id}`, placeId: place.id, ...timing(item) }] : [];
    });
    const eventStops = events
        .filter((event) => !event.allDay)
        .flatMap((event) => {
            const place = matchPlace(event.location, places);

            return place ? [{ key: `event-${event.id}`, placeId: place.id, ...timing(event) }] : [];
        });

    return [...itemStops, ...eventStops].sort((a, b) => a.startMinutes - b.startMinutes);
};

const timing = ({ startMinutes, durationMinutes }) => ({
    startMinutes,
    endMinutes: startMinutes + durationMinutes,
});

export const legsForDay = ({ date, items, events, places, startPlaceId }) =>
    stopsFor(items, events, places).flatMap((stop, index, stops) => {
        const previous = stops[index - 1];
        const fromPlaceId = previous ? previous.placeId : startPlaceId;
        if (fromPlaceId == null || fromPlaceId === stop.placeId) return [];

        const departMinutes = previous
            ? previous.endMinutes
            : Math.max(0, stop.startMinutes - FIRST_STOP_LEAD_MINUTES);

        return [
            {
                key: stop.key,
                fromPlaceId,
                toPlaceId: stop.placeId,
                startMinutes: stop.startMinutes,
                departAt: departAtFor(date, departMinutes),
            },
        ];
    });
