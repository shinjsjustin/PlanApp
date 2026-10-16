import { legsForDay, matchPlace, normalize } from './driveLegs';

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

describe('legsForDay', () => {
    const base = { date: '2026-10-05', places, startPlaceId: 1, items: [], events: [] };

    it('measures the first stop from the start place, departing 60 minutes before', () => {
        const items = [{ id: 7, placeId: 2, startMinutes: 600, durationMinutes: 30 }];
        expect(legsForDay({ ...base, items })).toEqual([
            { key: 'item-7', fromPlaceId: 1, toPlaceId: 2, startMinutes: 600, departAt: iso(9) },
        ]);
    });

    it('clamps the first departure at midnight', () => {
        const items = [{ id: 7, placeId: 2, startMinutes: 20, durationMinutes: 30 }];
        expect(legsForDay({ ...base, items })[0].departAt).toBe(iso(0));
    });

    it('orders mixed stops and departs each later leg at the previous end', () => {
        const items = [{ id: 7, placeId: 2, startMinutes: 720, durationMinutes: 30 }];
        const events = [
            { id: 'g1', allDay: false, startMinutes: 600, durationMinutes: 45, location: '1 Main St, Springfield' },
        ];
        const legs = legsForDay({ ...base, startPlaceId: 3, items, events });
        expect(legs).toEqual([
            { key: 'event-g1', fromPlaceId: 3, toPlaceId: 1, startMinutes: 600, departAt: iso(9) },
            { key: 'item-7', fromPlaceId: 1, toPlaceId: 2, startMinutes: 720, departAt: iso(10, 45) },
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

    it('ignores all-day, unmatched and placeless items and events', () => {
        const items = [
            { id: 1, placeId: null, startMinutes: 600, durationMinutes: 30 },
            { id: 2, placeId: 99, startMinutes: 650, durationMinutes: 30 },
        ];
        const events = [
            { id: 'a', allDay: true, startMinutes: 0, durationMinutes: 1440, location: '22 Oak Ave' },
            { id: 'b', allDay: false, startMinutes: 700, durationMinutes: 30, location: 'Nowhere' },
        ];
        expect(legsForDay({ ...base, items, events })).toEqual([]);
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
