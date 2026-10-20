import { driveMinutesOf, legsForDay, matchPlace, normalize } from './driveLegs';

const HOME = { id: 1, address: '1 Main St, Springfield' };
const GYM = { id: 2, address: '22 Oak Ave' };
const GYM_ANNEX = { id: 3, address: '22 Oak Ave Annex' };
const NO_ADDRESS = { id: 4, address: '' };
const places = [HOME, GYM, GYM_ANNEX, NO_ADDRESS];

const iso = (h, m = 0) => new Date(2026, 9, 5, h, m).toISOString();

describe('normalize', () => {
    it('lowercases, turns punctuation to spaces, collapses and trims', () => {
        expect(normalize('  22 Oak Ave.,  Apt #5 ')).toBe('22 oak ave apt 5');
    });
});

describe('matchPlace', () => {
    it('matches an address inside the location ignoring case and punctuation', () => {
        expect(matchPlace('Meet at 22 OAK ave, downtown', places)).toBe(GYM);
    });

    it('prefers the longest matching address', () => {
        expect(matchPlace('22 Oak Ave Annex, room 2', places)).toBe(GYM_ANNEX);
    });

    it('returns null for no match, empty location, or empty addresses', () => {
        expect(matchPlace('9 Elm St', places)).toBeNull();
        expect(matchPlace('', places)).toBeNull();
        expect(matchPlace(null, places)).toBeNull();
        expect(matchPlace('anything', [NO_ADDRESS])).toBeNull();
    });
});

describe('driveMinutesOf', () => {
    it.each([
        [{ status: 'ok', durationSeconds: 601 }, 15],
        [{ status: 'ok', durationSeconds: 600 }, 10],
        [{ status: 'ok', durationSeconds: 1 }, 5],
        [{ status: 'unavailable', mapsUrl: null }, 15],
    ])('answers %j take %i minutes', (answer, minutes) => {
        expect(driveMinutesOf(answer)).toBe(minutes);
    });
});

describe('legsForDay', () => {
    const base = { date: '2026-10-05', places, startPlaceId: 1, items: [] };

    it('measures the first stop from the start place, departing 60 minutes before', () => {
        const items = [{ id: 7, placeId: 2, startMinutes: 600, durationMinutes: 30 }];
        expect(legsForDay({ ...base, items })).toEqual([
            { key: 'item-7', fromPlaceId: 1, toPlaceId: 2, startMinutes: 600, departAt: iso(9) },
        ]);
    });

    it('never departs the first leg before 08:00', () => {
        const items = [{ id: 7, placeId: 2, startMinutes: 500, durationMinutes: 30 }];
        expect(legsForDay({ ...base, items })[0].departAt).toBe(iso(8));
    });

    it('makes no leg before the first placed booking when that place is work', () => {
        const work = { id: 5, address: '5 Job Rd', kind: 'work' };
        const items = [
            { id: 1, placeId: 5, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: 2, startMinutes: 700, durationMinutes: 30 },
        ];
        expect(legsForDay({ ...base, places: [...places, work], items })).toEqual([
            { key: 'item-2', fromPlaceId: 5, toPlaceId: 2, startMinutes: 700, departAt: iso(10, 30) },
        ]);
    });

    it('still drives to a work place that is not the first stop', () => {
        const work = { id: 5, address: '5 Job Rd', kind: 'work' };
        const items = [
            { id: 1, placeId: 2, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: 5, startMinutes: 700, durationMinutes: 30 },
        ];
        expect(legsForDay({ ...base, places: [...places, work], items }).map((leg) => leg.key)).toEqual([
            'item-1',
            'item-2',
        ]);
    });

    it('skips a leg whose origin is the same place but still chains from it', () => {
        const items = [
            { id: 1, placeId: 2, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: 2, startMinutes: 700, durationMinutes: 30 },
            { id: 3, placeId: 1, startMinutes: 800, durationMinutes: 30 },
        ];
        const legs = legsForDay({ ...base, startPlaceId: 2, items });
        expect(legs).toEqual([
            { key: 'item-3', fromPlaceId: 2, toPlaceId: 1, startMinutes: 800, departAt: iso(12, 10) },
        ]);
    });

    it('an unplaced booking between placed ones leaves the last place unchanged', () => {
        const items = [
            { id: 1, placeId: 2, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: null, startMinutes: 650, durationMinutes: 30 },
            { id: 3, placeId: 1, startMinutes: 720, durationMinutes: 30 },
        ];
        const legs = legsForDay({ ...base, startPlaceId: 2, items });
        expect(legs).toEqual([
            { key: 'item-3', fromPlaceId: 2, toPlaceId: 1, startMinutes: 720, departAt: iso(10, 30) },
        ]);
    });

    it('ignores placeless and unknown-place items', () => {
        const items = [
            { id: 1, placeId: null, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: 99, startMinutes: 650, durationMinutes: 30 },
        ];
        expect(legsForDay({ ...base, items })).toEqual([]);
    });

    it('makes no leg for the first stop without a start place', () => {
        const items = [
            { id: 1, placeId: 2, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: 1, startMinutes: 700, durationMinutes: 30 },
        ];
        const legs = legsForDay({ ...base, startPlaceId: null, items });
        expect(legs).toEqual([
            { key: 'item-2', fromPlaceId: 2, toPlaceId: 1, startMinutes: 700, departAt: iso(10, 30) },
        ]);
    });
});
