'use strict';

jest.mock('../../src/lib/google/routesApi');

const { computeDrive } = require('../../src/lib/google/routesApi');
const { travelBetween } = require('../../src/lib/travelTime');
const { useTransaction } = require('../helpers/db');

const getConn = useTransaction();

const NOW = new Date('2026-10-16T12:00:00.000Z'); // Friday
const FUTURE = new Date('2026-10-20T15:00:00.000Z'); // Tuesday
const ORIGIN = '1 Main St';
const DESTINATION = '2 Oak Ave';
const DRIVE = { durationSeconds: 600, distanceMeters: 5000 };

const lookup = (overrides = {}) =>
    travelBetween({
        originAddress: ORIGIN,
        destinationAddress: DESTINATION,
        departAt: FUTURE,
        timeZone: 'UTC',
        now: NOW,
        ...overrides,
    });

const cachedRows = async () => {
    const [rows] = await getConn().execute('SELECT * FROM travel_times');
    return rows;
};

beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    computeDrive.mockReset();
    computeDrive.mockResolvedValue(DRIVE);
});

afterAll(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
});

describe('travelBetween', () => {
    test('fetches, caches and answers ok with a driving directions link', async () => {
        const result = await lookup();

        expect(result).toEqual({
            status: 'ok',
            ...DRIVE,
            mapsUrl:
                'https://www.google.com/maps/dir/?api=1&origin=1%20Main%20St&destination=2%20Oak%20Ave&travelmode=driving',
        });
        expect(computeDrive).toHaveBeenCalledTimes(1);
        expect(computeDrive).toHaveBeenCalledWith('test-key', {
            originAddress: ORIGIN,
            destinationAddress: DESTINATION,
            departureTime: '2026-10-20T15:00:00.000Z',
        });
        const rows = await cachedRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].bucket).toBe(2 * 24 + 15);
    });

    test('reuses the cached row for the same pair and hour of week, ignoring address spacing and case', async () => {
        await lookup();
        const second = await lookup({
            originAddress: '  1  MAIN st ',
            departAt: new Date('2026-10-27T15:30:00.000Z'),
        });

        expect(computeDrive).toHaveBeenCalledTimes(1);
        expect(second).toMatchObject({ status: 'ok', ...DRIVE });
    });

    test('fetches again for a different hour of the week', async () => {
        await lookup();
        await lookup({ departAt: new Date('2026-10-20T16:00:00.000Z') });

        expect(computeDrive).toHaveBeenCalledTimes(2);
    });

    test('refetches and overwrites a row older than 30 days', async () => {
        await lookup();
        await getConn().execute('UPDATE travel_times SET fetched_at = NOW() - INTERVAL 31 DAY');
        computeDrive.mockResolvedValue({ durationSeconds: 900, distanceMeters: 7000 });

        const result = await lookup();

        expect(computeDrive).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ durationSeconds: 900, distanceMeters: 7000 });
        const rows = await cachedRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].duration_seconds).toBe(900);
        expect(new Date(rows[0].fetched_at).getTime()).toBeGreaterThan(Date.now() - 60000);
    });

    test('keeps a row 29 days old', async () => {
        await lookup();
        await getConn().execute('UPDATE travel_times SET fetched_at = NOW() - INTERVAL 29 DAY');

        await lookup();

        expect(computeDrive).toHaveBeenCalledTimes(1);
    });

    test('moves a past departure forward by whole weeks to after now', async () => {
        await lookup({ departAt: new Date('2026-01-05T15:00:00.000Z') }); // a Monday

        expect(computeDrive.mock.calls[0][1].departureTime).toBe('2026-10-19T15:00:00.000Z');
    });

    test('keeps the same local hour across a DST change when moving forward', async () => {
        // Monday 10:00 EST; by 19 Oct 2026 New York is on EDT.
        await lookup({ departAt: new Date('2026-01-05T15:00:00.000Z'), timeZone: 'America/New_York' });

        expect(computeDrive.mock.calls[0][1].departureTime).toBe('2026-10-19T14:00:00.000Z');
    });

    test('buckets by the hour of the week in the given time zone', async () => {
        await lookup({ timeZone: 'America/New_York' }); // Tue 11:00 EDT

        expect((await cachedRows())[0].bucket).toBe(2 * 24 + 11);
    });

    test.each([['unset', undefined], ['blank', '   ']])(
        'answers unavailable with the link and caches nothing when the key is %s',
        async (_label, key) => {
            if (key === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
            else process.env.GOOGLE_MAPS_API_KEY = key;

            const result = await lookup();

            expect(result.status).toBe('unavailable');
            expect(result.mapsUrl).toContain('travelmode=driving');
            expect(result).not.toHaveProperty('durationSeconds');
            expect(computeDrive).not.toHaveBeenCalled();
            expect(await cachedRows()).toHaveLength(0);
        }
    );

    test('answers unavailable and caches nothing when computeDrive throws', async () => {
        computeDrive.mockRejectedValue(new Error('boom'));

        const result = await lookup();

        expect(result).toEqual({
            status: 'unavailable',
            mapsUrl:
                'https://www.google.com/maps/dir/?api=1&origin=1%20Main%20St&destination=2%20Oak%20Ave&travelmode=driving',
        });
        expect(await cachedRows()).toHaveLength(0);
    });
});
