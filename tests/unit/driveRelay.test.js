'use strict';

const { relayDay, driveMinutesOf, departAtFor } = require('../../src/lib/driveRelay');

describe('driveMinutesOf', () => {
    it.each([
        [{ status: 'ok', durationSeconds: 601 }, 15],
        [{ status: 'ok', durationSeconds: 600 }, 10],
        [{ status: 'ok', durationSeconds: 1 }, 5],
        [{ status: 'ok', durationSeconds: 0 }, 0],
        [{ status: 'unavailable' }, 15],
        [{ status: 'error', durationSeconds: 60 }, 15],
    ])('maps %j to %i minutes', (answer, expected) => {
        expect(driveMinutesOf(answer)).toBe(expected);
    });
});

describe('departAtFor', () => {
    it('returns the UTC instant for a UTC wall-clock minute', () => {
        expect(departAtFor('2026-03-08', 540, 'UTC').toISOString()).toBe('2026-03-08T09:00:00.000Z');
    });

    it('uses the standard offset (UTC-5) the day before a New York spring-forward', () => {
        expect(departAtFor('2026-03-07', 540, 'America/New_York').toISOString()).toBe('2026-03-07T14:00:00.000Z');
    });

    it('uses the daylight offset (UTC-4) on the morning of a New York spring-forward', () => {
        // 09:00 is after the 02:00 change.
        expect(departAtFor('2026-03-08', 540, 'America/New_York').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    });

    it('handles fall-back day', () => {
        expect(departAtFor('2026-11-01', 600, 'America/New_York').toISOString()).toBe('2026-11-01T15:00:00.000Z');
    });
});

describe('relayDay', () => {
    const places = [
        { id: 1, kind: 'home' },
        { id: 2, kind: 'work' },
        { id: 3, kind: 'other' },
        { id: 4, kind: 'other' },
    ];
    const booking = (startMinutes, durationMinutes, placeId) => ({ startMinutes, durationMinutes, placeId });
    const run = (bookings, startPlaceId = 1, minutes = 15) => {
        const calls = [];
        const driveMinutes = async (leg) => {
            calls.push(leg);
            return minutes;
        };
        return relayDay({ bookings, places, startPlaceId, driveMinutes }).then((result) => ({ result, calls }));
    };

    it('pushes a booking at a new place past the previous end plus the drive', async () => {
        const { result, calls } = await run([booking(600, 60, 3), booking(660, 30, 4)]);
        expect(result.map((b) => b.startMinutes)).toEqual([600, 675]);
        expect(calls[1]).toEqual({ fromPlaceId: 3, toPlaceId: 4, departMinutes: 660 });
    });

    it('pushes later bookings down after a pushed one', async () => {
        const { result } = await run([booking(600, 60, 3), booking(660, 30, 4), booking(690, 30, 4)]);
        expect(result.map((b) => b.startMinutes)).toEqual([600, 675, 705]);
    });

    it('adds no drive between bookings at the same place', async () => {
        const { result, calls } = await run([booking(600, 60, 3), booking(660, 30, 3)]);
        expect(result.map((b) => b.startMinutes)).toEqual([600, 660]);
        expect(calls).toHaveLength(1);
    });

    it('adds no drive before a first booking at a work place', async () => {
        const { result, calls } = await run([booking(480, 60, 2)]);
        expect(result[0].startMinutes).toBe(480);
        expect(calls).toHaveLength(0);
    });

    it('adds no drive when there is no start place', async () => {
        const { calls } = await run([booking(600, 60, 3)], null);
        expect(calls).toHaveLength(0);
    });

    it('drives from the start place an hour before a first booking, not below 08:00', async () => {
        const late = await run([booking(720, 30, 3)]);
        expect(late.calls[0]).toEqual({ fromPlaceId: 1, toPlaceId: 3, departMinutes: 660 });
        const early = await run([booking(500, 30, 3)]);
        expect(early.calls[0].departMinutes).toBe(480);
        expect(early.result[0].startMinutes).toBe(500);
    });

    it('pushes an early first booking to the cursor plus the drive', async () => {
        const { result } = await run([booking(480, 30, 3)]);
        expect(result[0].startMinutes).toBe(495);
    });

    it('gives unplaced bookings no drive and keeps the last place', async () => {
        const { result, calls } = await run([booking(600, 30, 3), booking(630, 30, null), booking(660, 30, 3)]);
        expect(result.map((b) => b.startMinutes)).toEqual([600, 630, 660]);
        expect(calls).toHaveLength(1);
    });

    it('returns untouched bookings by reference and new objects for moved ones', async () => {
        const input = [booking(600, 60, 3), booking(660, 30, 4)];
        const { result } = await run(input);
        expect(result[0]).toBe(input[0]);
        expect(result[1]).not.toBe(input[1]);
        expect(input[1].startMinutes).toBe(660);
    });

    it('walks bookings by start even when given out of order', async () => {
        const { result } = await run([booking(660, 30, 4), booking(600, 60, 3)]);
        expect(result.map((b) => b.placeId)).toEqual([3, 4]);
    });
});
