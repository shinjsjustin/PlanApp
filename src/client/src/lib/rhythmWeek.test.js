import {
    DAYS, weekStart, addWeeks, anchorsByDay, gateSegments, zoneLabel, draftOf, patchBodyOf,
} from './rhythmWeek';

const anchor = (over = {}) => ({
    id: 'wake', title: 'Wake', description: null, time: '06:30', days: 'daily', enabled: true, ...over,
});
const gate = (over = {}) => ({
    id: 'g1', title: 'Plan', kind: 'plan', state: 'open',
    opensAt: '2026-11-01T05:30:00.000Z', closesAt: '2026-11-01T09:00:00.000Z', ...over,
});
const CHICAGO = 'America/Chicago';

describe('DAYS', () => {
    it('runs Monday to Sunday', () => {
        expect(DAYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    });
});

describe('weekStart', () => {
    it.each([
        ['2026-11-02T03:00:00Z', CHICAGO, '2026-10-26'], // still Sunday evening in Chicago
        ['2026-11-02T03:00:00Z', 'UTC', '2026-11-02'],
        ['2026-11-02T12:00:00Z', CHICAGO, '2026-11-02'], // a Monday
        ['2026-11-08T23:00:00Z', CHICAGO, '2026-11-02'], // a Sunday
        ['2027-01-01T12:00:00Z', 'UTC', '2026-12-28'], // across the year
    ])('%s in %s starts the week on %s', (now, zone, expected) => {
        expect(weekStart(new Date(now), zone)).toBe(expected);
    });
});

describe('addWeeks', () => {
    it.each([
        ['2026-10-26', 1, '2026-11-02'],
        ['2026-10-26', -1, '2026-10-19'],
        ['2026-12-28', 1, '2027-01-04'],
        ['2026-10-26', 0, '2026-10-26'],
    ])('%s + %i weeks is %s', (key, n, expected) => {
        expect(addWeeks(key, n)).toBe(expected);
    });
});

describe('anchorsByDay', () => {
    it('puts a daily anchor on all seven days at its minutes', () => {
        const byDay = anchorsByDay([anchor()]);

        expect(Object.keys(byDay)).toEqual(DAYS);
        DAYS.forEach((day) => {
            expect(byDay[day]).toEqual([{ ...anchor(), minutes: 390, disabled: false }]);
        });
    });

    it('places a listed anchor only on its days, sorted by minute, flagging disabled', () => {
        const late = anchor({ id: 'late', time: '21:00', days: ['mon', 'wed'] });
        const early = anchor({ id: 'early', time: '05:15', days: ['mon'], enabled: false });
        const byDay = anchorsByDay([late, early]);

        expect(byDay.mon.map((a) => [a.id, a.minutes, a.disabled])).toEqual([['early', 315, true], ['late', 1260, false]]);
        expect(byDay.wed.map((a) => a.id)).toEqual(['late']);
        expect(byDay.tue).toEqual([]);
    });
});

describe('gateSegments', () => {
    it('converts across the fall-back change with the zone, not a fixed offset', () => {
        // 00:30 CDT to 03:00 CST on Sunday 2026-11-01
        expect(gateSegments([gate()], '2026-10-26', CHICAGO)).toEqual([
            { gate: gate(), day: 'sun', startMin: 30, endMin: 180, closes: true },
        ]);
    });

    it('converts across the spring-forward change', () => {
        const g = gate({ opensAt: '2026-03-08T07:00:00.000Z', closesAt: '2026-03-08T08:30:00.000Z' });

        expect(gateSegments([g], '2026-03-02', CHICAGO)).toEqual([
            { gate: g, day: 'sun', startMin: 60, endMin: 210, closes: true },
        ]);
    });

    it('splits a multi-week gate per day, clipped to each week, closing only on its last day', () => {
        const g = gate({ opensAt: '2026-10-29T15:00:00.000Z', closesAt: '2026-11-03T18:00:00.000Z' });

        const first = gateSegments([g], '2026-10-26', CHICAGO);
        expect(first.map((s) => [s.day, s.startMin, s.endMin, s.closes])).toEqual([
            ['thu', 600, 1440, false], ['fri', 0, 1440, false], ['sat', 0, 1440, false], ['sun', 0, 1440, false],
        ]);

        const second = gateSegments([g], '2026-11-02', CHICAGO);
        expect(second.map((s) => [s.day, s.startMin, s.endMin, s.closes])).toEqual([
            ['mon', 0, 1440, false], ['tue', 0, 720, true],
        ]);
    });

    it('closes on the previous day when the gate ends exactly at midnight', () => {
        const g = gate({ opensAt: '2026-10-26T15:00:00.000Z', closesAt: '2026-10-28T05:00:00.000Z' });

        expect(gateSegments([g], '2026-10-26', CHICAGO).map((s) => [s.day, s.startMin, s.endMin, s.closes])).toEqual([
            ['mon', 600, 1440, false], ['tue', 0, 1440, true],
        ]);
    });

    it('returns nothing for a gate outside the week', () => {
        expect(gateSegments([gate()], '2026-11-02', CHICAGO)).toEqual([]);
    });

    it.each(['green', 'assumed', 'rejected'])('skips a %s gate', (state) => {
        expect(gateSegments([gate({ state })], '2026-10-26', CHICAGO)).toEqual([]);
    });

    it('keeps a held gate', () => {
        expect(gateSegments([gate({ state: 'held' })], '2026-10-26', CHICAGO)).toHaveLength(1);
    });
});

describe('zoneLabel', () => {
    it('shows the stored zone', () => {
        expect(zoneLabel(CHICAGO, 'Asia/Tokyo')).toBe(CHICAGO);
    });

    it('marks the browser zone as this device when none is stored', () => {
        expect(zoneLabel(null, 'Asia/Tokyo')).toBe('Asia/Tokyo (this device)');
    });
});

describe('draftOf', () => {
    it('lists all seven days for a daily anchor', () => {
        expect(draftOf(anchor())).toEqual({ time: '06:30', days: DAYS, enabled: true });
    });

    it('copies a listed anchor', () => {
        expect(draftOf(anchor({ days: ['tue'], enabled: false }))).toEqual({ time: '06:30', days: ['tue'], enabled: false });
    });
});

describe('patchBodyOf', () => {
    it('returns null body when nothing changed', () => {
        expect(patchBodyOf(anchor(), draftOf(anchor()))).toEqual({ body: null });
    });

    it('returns only the changed time', () => {
        expect(patchBodyOf(anchor(), { ...draftOf(anchor()), time: '07:30' })).toEqual({ body: { time: '07:30' } });
    });

    it('returns only enabled when toggled', () => {
        expect(patchBodyOf(anchor(), { ...draftOf(anchor()), enabled: false })).toEqual({ body: { enabled: false } });
    });

    it('returns days in week order when a subset is chosen', () => {
        const draft = { ...draftOf(anchor()), days: ['wed', 'mon'] };

        expect(patchBodyOf(anchor(), draft)).toEqual({ body: { days: ['mon', 'wed'] } });
    });

    it('sends daily when all seven are on and the anchor was a list', () => {
        const a = anchor({ days: ['mon'] });

        expect(patchBodyOf(a, { ...draftOf(a), days: [...DAYS].reverse() })).toEqual({ body: { days: 'daily' } });
    });

    it('is unchanged when the same days are picked in another order', () => {
        const a = anchor({ days: ['mon', 'wed'] });

        expect(patchBodyOf(a, { ...draftOf(a), days: ['wed', 'mon'] })).toEqual({ body: null });
    });

    it.each(['7:30', '24:00', '12:60', '', 'ab:cd', '07:30:00'])('rejects the time "%s"', (time) => {
        expect(patchBodyOf(anchor(), { ...draftOf(anchor()), time }).error).toEqual(expect.any(String));
    });

    it('rejects no days', () => {
        const result = patchBodyOf(anchor(), { ...draftOf(anchor()), days: [] });

        expect(result.error).toEqual(expect.any(String));
        expect(result.body).toBeUndefined();
    });
});
