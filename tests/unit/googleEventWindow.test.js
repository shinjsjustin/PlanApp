'use strict';

const { eventsInRange, rangeWindow } = require('../../src/lib/googleEventWindow');

const timed = (id, start, end, extra = {}) => ({
    id,
    summary: `E${id}`,
    start: { dateTime: start },
    end: { dateTime: end },
    ...extra,
});
const allDay = (id, start, end) => ({ id, summary: `E${id}`, start: { date: start }, end: { date: end } });

describe('rangeWindow', () => {
    test('pads a day before from and a day after to', () => {
        expect(rangeWindow('2026-10-15', '2026-10-16')).toEqual({
            timeMin: '2026-10-14T00:00:00.000Z',
            timeMax: '2026-10-18T00:00:00.000Z',
        });
    });
});

describe('eventsInRange', () => {
    test('keeps timed events whose local dates touch the range, in the given zone', () => {
        const events = [
            timed('in', '2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z'),
            timed('before', '2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z'),
            timed('after', '2026-10-17T10:00:00Z', '2026-10-17T11:00:00Z'),
            // 2026-10-17 03:00 UTC is still 2026-10-16 in New York
            timed('zone', '2026-10-17T03:00:00Z', '2026-10-17T04:00:00Z'),
            timed('spans', '2026-10-14T20:00:00Z', '2026-10-17T20:00:00Z'),
        ];
        const ids = eventsInRange(events, '2026-10-15', '2026-10-16', 'America/New_York').map((e) => e.id);
        expect(ids).toEqual(['in', 'zone', 'spans']);
    });

    test('keeps all-day events with start <= to and end > from', () => {
        const events = [
            allDay('ends-on-from', '2026-10-14', '2026-10-15'),
            allDay('touches-from', '2026-10-14', '2026-10-16'),
            allDay('on-to', '2026-10-16', '2026-10-17'),
            allDay('after-to', '2026-10-17', '2026-10-18'),
        ];
        const ids = eventsInRange(events, '2026-10-15', '2026-10-16', 'UTC').map((e) => e.id);
        expect(ids).toEqual(['touches-from', 'on-to']);
    });

    test('drops cancelled events', () => {
        const events = [timed('x', '2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z', { status: 'cancelled' })];
        expect(eventsInRange(events, '2026-10-15', '2026-10-15', 'UTC')).toEqual([]);
    });

    test('maps to the wire shape with null summary and location when absent', () => {
        const events = [
            timed('a', '2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z', { location: 'Room 1' }),
            { id: 'b', start: { date: '2026-10-15' }, end: { date: '2026-10-16' } },
        ];
        expect(eventsInRange(events, '2026-10-15', '2026-10-15', 'UTC')).toEqual([
            { id: 'a', summary: 'Ea', start: '2026-10-15T10:00:00Z', end: '2026-10-15T11:00:00Z', allDay: false, location: 'Room 1' },
            { id: 'b', summary: null, start: '2026-10-15', end: '2026-10-16', allDay: true, location: null },
        ]);
    });
});
