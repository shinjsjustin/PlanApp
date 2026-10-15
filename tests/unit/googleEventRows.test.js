'use strict';

const { eventsToDayRows, importWindow } = require('../../src/lib/googleEventRows');

const NY = 'America/New_York';
const day = (id, date) => ({ id, date });
const timed = (id, start, end, extra = {}) => ({
    id,
    summary: 'Meet',
    start: { dateTime: start },
    end: { dateTime: end },
    ...extra,
});

describe('eventsToDayRows timed events', () => {
    it('gives minutes from local midnight in the zone', () => {
        // 14:30Z is 10:30 in New York (EDT, UTC-4)
        const rows = eventsToDayRows(
            [timed('e1', '2026-06-10T14:30:00Z', '2026-06-10T15:15:00Z')],
            [day(1, '2026-06-10')],
            NY
        );
        expect(rows).toEqual([
            { dayId: 1, googleEventId: 'e1', title: 'Meet', allDay: false, startMinutes: 630, durationMinutes: 45 },
        ]);
    });

    it('splits an event crossing midnight into clipped rows per day', () => {
        // 23:00 to 01:30 local (EDT)
        const rows = eventsToDayRows(
            [timed('e1', '2026-06-11T03:00:00Z', '2026-06-11T05:30:00Z')],
            [day(1, '2026-06-10'), day(2, '2026-06-11'), day(3, '2026-06-12')],
            NY
        );
        expect(rows.map((r) => [r.dayId, r.startMinutes, r.durationMinutes])).toEqual([
            [1, 1380, 60],
            [2, 0, 90],
        ]);
    });

    it('measures from the real local midnight on a spring-forward day', () => {
        // 2026-03-08: clocks jump 02:00 -> 03:00 in New York; 08:00Z is 04:00 EDT
        // 3 real hours after local midnight (05:00Z)
        const rows = eventsToDayRows(
            [timed('e1', '2026-03-08T08:00:00Z', '2026-03-08T09:00:00Z')],
            [day(1, '2026-03-08')],
            NY
        );
        expect(rows[0].startMinutes).toBe(180);
        expect(rows[0].durationMinutes).toBe(60);
    });

    it('clips to the 25-hour day on a fall-back day', () => {
        // 2026-11-01 local day runs 04:00Z to 05:00Z next day (25h); event starts in its last hour
        const rows = eventsToDayRows(
            [timed('e1', '2026-11-02T04:00:00Z', '2026-11-02T08:00:00Z')],
            [day(1, '2026-11-01'), day(2, '2026-11-02')],
            NY
        );
        expect(rows.map((r) => [r.dayId, r.startMinutes, r.durationMinutes])).toEqual([
            [1, 1440, 60],
            [2, 0, 180],
        ]);
    });

    it('ignores days the event does not touch', () => {
        const rows = eventsToDayRows(
            [timed('e1', '2026-06-10T14:00:00Z', '2026-06-10T15:00:00Z')],
            [day(1, '2026-06-09'), day(2, '2026-06-11')],
            NY
        );
        expect(rows).toEqual([]);
    });
});

describe('eventsToDayRows all-day events', () => {
    it('covers start.date up to but excluding end.date', () => {
        const rows = eventsToDayRows(
            [{ id: 'a', summary: 'Trip', start: { date: '2026-06-10' }, end: { date: '2026-06-12' } }],
            [day(1, '2026-06-09'), day(2, '2026-06-10'), day(3, '2026-06-11'), day(4, '2026-06-12')],
            NY
        );
        expect(rows).toEqual([
            { dayId: 2, googleEventId: 'a', title: 'Trip', allDay: true, startMinutes: 0, durationMinutes: 1440 },
            { dayId: 3, googleEventId: 'a', title: 'Trip', allDay: true, startMinutes: 0, durationMinutes: 1440 },
        ]);
    });
});

describe('eventsToDayRows exclusions and titles', () => {
    const days = [day(1, '2026-06-10')];
    const base = () => timed('e1', '2026-06-10T14:00:00Z', '2026-06-10T15:00:00Z');

    it('skips cancelled events', () => {
        expect(eventsToDayRows([{ ...base(), status: 'cancelled' }], days, NY)).toEqual([]);
    });

    it('skips events SHINPLAN exported', () => {
        const event = { ...base(), extendedProperties: { private: { shinplanKey: 'k' } } };
        expect(eventsToDayRows([event], days, NY)).toEqual([]);
    });

    it('keeps events with private properties but no shinplanKey', () => {
        const event = { ...base(), extendedProperties: { private: { other: 'x' } } };
        expect(eventsToDayRows([event], days, NY)).toHaveLength(1);
    });

    it('skips ids over 255 chars and keeps 255', () => {
        expect(eventsToDayRows([{ ...base(), id: 'x'.repeat(256) }], days, NY)).toEqual([]);
        expect(eventsToDayRows([{ ...base(), id: 'x'.repeat(255) }], days, NY)).toHaveLength(1);
    });

    it('gives undated days no rows', () => {
        expect(eventsToDayRows([base()], [{ id: 1, date: null }], NY)).toEqual([]);
    });

    it('caps titles at 500 chars and defaults an empty one', () => {
        const long = eventsToDayRows([{ ...base(), summary: 'y'.repeat(501) }], days, NY);
        expect(long[0].title).toHaveLength(500);
        const empty = eventsToDayRows([{ ...base(), summary: undefined }], days, NY);
        expect(empty[0].title).toBe('(No title)');
    });
});

describe('importWindow', () => {
    it('runs from one UTC day before the first date to two after the last', () => {
        expect(importWindow([day(2, '2026-06-12'), day(1, '2026-06-10'), day(3, null)])).toEqual({
            timeMin: '2026-06-09T00:00:00.000Z',
            timeMax: '2026-06-14T00:00:00.000Z',
        });
    });

    it('returns null when no day is dated', () => {
        expect(importWindow([day(1, null), day(2, null)])).toBeNull();
    });
});
