import {
    CATEGORIES,
    livedTodayKey,
    weekOf,
    laneBlocks,
    labelMode,
    timelineRange,
    weekBarSegments,
    formatMinutes,
    readCalendarView,
    saveCalendarView,
} from './lived';

const m = (startMinutes, durationMinutes, extra = {}) => ({
    id: extra.id ?? startMinutes,
    title: 't',
    category: 'work',
    startMinutes,
    durationMinutes,
    ...extra,
});

describe('CATEGORIES', () => {
    it('lists the seven categories with labels', () => {
        expect(CATEGORIES.map((c) => c.key)).toEqual(
            ['god', 'family', 'work', 'building', 'rest', 'sleep', 'drive']
        );
        expect(CATEGORIES.every((c) => typeof c.label === 'string' && c.label)).toBe(true);
    });
});

describe('livedTodayKey', () => {
    it.each([
        [new Date(2026, 9, 31, 3, 59), '2026-10-30'],
        [new Date(2026, 9, 31, 4, 0), '2026-10-31'],
        [new Date(2026, 10, 1, 0, 30), '2026-10-31'],
        [new Date(2026, 0, 1, 2, 0), '2025-12-31'],
    ])('rolls the day over at 04:00 (%s)', (now, expected) => {
        expect(livedTodayKey(now)).toBe(expected);
    });
});

describe('weekOf', () => {
    const week = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];

    it('runs Saturday to Friday for a Saturday, a Wednesday and a Friday', () => {
        expect(weekOf('2026-10-24')).toEqual(week);
        expect(weekOf('2026-10-28')).toEqual(week);
        expect(weekOf('2026-10-30')).toEqual(week);
    });

    it('starts the next week on the following Saturday', () => {
        expect(weekOf('2026-10-31')[0]).toBe('2026-10-31');
    });

    it('crosses a year boundary', () => {
        expect(weekOf('2026-01-01')).toEqual([
            '2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
        ]);
    });
});

describe('laneBlocks', () => {
    it('sorts by start and leaves disjoint moments alone', () => {
        const out = laneBlocks([m(600, 30), m(480, 60)]);
        expect(out.map((b) => [b.startMinutes, b.durationMinutes, b.covered])).toEqual([
            [480, 60, false],
            [600, 30, false],
        ]);
    });

    it('clips an overlapping moment to start at the previous end', () => {
        const out = laneBlocks([m(480, 60), m(520, 60)]);
        expect([out[1].startMinutes, out[1].durationMinutes, out[1].covered]).toEqual([540, 40, false]);
    });

    it('keeps a 4-minute covered sliver for a fully covered moment', () => {
        const out = laneBlocks([m(480, 120, { id: 1 }), m(500, 30, { id: 2 })]);
        expect(out[1]).toMatchObject({ id: 2, startMinutes: 600, durationMinutes: 4, covered: true });
    });

    it('does not mutate its input', () => {
        const input = [m(480, 60), m(500, 60)];
        laneBlocks(input);
        expect(input[1].startMinutes).toBe(500);
    });

    it('returns an empty lane for no moments', () => {
        expect(laneBlocks([])).toEqual([]);
    });
});

describe('labelMode', () => {
    it.each([
        [19, 200, 'colour'],
        [20, 10, 'colour'],
        [30, 20, 'title'],
        [60, 40, 'title-detail'],
        [60, 10, 'colour'],
    ])('duration %i at %ipx is %s', (duration, height, expected) => {
        expect(labelMode(duration, height)).toBe(expected);
    });
});

describe('timelineRange', () => {
    it('defaults to 06:00-24:00', () => {
        expect(timelineRange([])).toEqual({ start: 360, end: 1440 });
        expect(timelineRange([m(600, 60)])).toEqual({ start: 360, end: 1440 });
    });

    it('widens to whole hours around early and late moments', () => {
        expect(timelineRange([m(270, 30)])).toEqual({ start: 240, end: 1440 });
        expect(timelineRange([m(1400, 100)])).toEqual({ start: 360, end: 1500 });
        expect(timelineRange([m(1400, 130)])).toEqual({ start: 360, end: 1560 });
    });
});

describe('weekBarSegments', () => {
    it('gives percent offsets across 06:00-24:00', () => {
        const [seg] = weekBarSegments([m(360, 540, { category: 'sleep' })]);
        expect(seg).toMatchObject({ category: 'sleep', left: 0, width: 50 });
    });

    it('clips to the window and drops moments outside it', () => {
        const segs = weekBarSegments([m(300, 120, { id: 1 }), m(1380, 120, { id: 2 }), m(250, 60, { id: 3 })]);
        expect(segs).toHaveLength(2);
        expect(segs[0]).toMatchObject({ id: 1, left: 0 });
        expect(segs[0].width).toBeCloseTo((60 / 1080) * 100);
        expect(segs[1].left).toBeCloseTo((1020 / 1080) * 100);
        expect(segs[1].width).toBeCloseTo((60 / 1080) * 100);
    });
});

describe('formatMinutes', () => {
    it.each([
        [0, '00:00'],
        [485, '08:05'],
        [1440, '00:00'],
        [1500, '01:00'],
    ])('%i is %s', (min, expected) => {
        expect(formatMinutes(min)).toBe(expected);
    });
});

describe('calendar view preference', () => {
    beforeEach(() => localStorage.clear());

    it('defaults to lived on phones and plan on desktops', () => {
        expect(readCalendarView(true)).toBe('lived');
        expect(readCalendarView(false)).toBe('plan');
    });

    it('persists a saved choice over the default', () => {
        saveCalendarView('plan');
        expect(localStorage.getItem('calendarView')).toBe('plan');
        expect(readCalendarView(true)).toBe('plan');
        saveCalendarView('lived');
        expect(readCalendarView(false)).toBe('lived');
    });

    it('ignores unknown stored values', () => {
        localStorage.setItem('calendarView', 'grid');
        expect(readCalendarView(true)).toBe('lived');
        expect(readCalendarView(false)).toBe('plan');
    });
});
