import {
    FILTERS,
    dayMarks,
    dayPercent,
    filterCounts,
    filterChores,
    nowPercent,
    orderChores,
    timelineBar,
    timelineRange,
    weekMarks,
} from './choreSchedule';

// Today is Tue 2026-11-03, so the range runs Fri 2026-10-30 to Thu 2026-11-19.
const TODAY = '2026-11-03';
const DAY = 100 / 21;
const range = timelineRange(TODAY);

const chore = (name, dueFrom, dueBy) => ({ name, dueFrom, dueBy });

describe('orderChores', () => {
    test('puts done chores by dueBy then name, never-done last by name, without mutating', () => {
        const input = [
            chore('Zed', null, null),
            chore('B', '2026-11-01', '2026-11-05'),
            chore('Amy', null, null),
            chore('A', '2026-11-01', '2026-11-05'),
            chore('Early', '2026-10-01', '2026-10-20'),
        ];
        const copy = [...input];

        const result = orderChores(input);

        expect(result.map((c) => c.name)).toEqual(['Early', 'A', 'B', 'Amy', 'Zed']);
        expect(result).not.toBe(input);
        expect(input).toEqual(copy);
    });
});

describe('filterChores', () => {
    const chores = [
        chore('yesterday', '2026-10-30', '2026-11-02'),
        chore('today', '2026-10-30', '2026-11-03'),
        chore('plus3', '2026-10-30', '2026-11-06'),
        chore('plus4', '2026-10-30', '2026-11-07'),
        chore('never', null, null),
    ];
    const names = (id) => filterChores(chores, id, TODAY).map((c) => c.name);

    test('lists the filters in order', () => {
        expect(FILTERS).toEqual([
            { id: 'all', label: 'All' },
            { id: 'soon', label: 'Due within 3 days' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'never', label: 'Never done' },
        ]);
    });

    test('all keeps everything', () => {
        expect(names('all')).toHaveLength(5);
    });

    test('soon is dueBy today through today+3, overdue excluded', () => {
        expect(names('soon')).toEqual(['today', 'plus3']);
    });

    test('overdue is dueBy before today', () => {
        expect(names('overdue')).toEqual(['yesterday']);
    });

    test('never is chores without dueBy', () => {
        expect(names('never')).toEqual(['never']);
    });
});

describe('timeline geometry', () => {
    test('range spans 21 days from today-4', () => {
        expect(range).toEqual({ start: '2026-10-30', days: 21 });
    });

    test('dayPercent counts days from start', () => {
        expect(dayPercent('2026-10-30', range)).toBeCloseTo(0);
        expect(dayPercent('2026-11-03', range)).toBeCloseTo(4 * DAY);
    });

    test('nowPercent is the middle of today', () => {
        expect(nowPercent(range, TODAY)).toBeCloseTo(4.5 * DAY);
    });

    test('weekMarks has one per Monday', () => {
        const marks = weekMarks(range);
        expect(marks.map((m) => [m.key, m.label])).toEqual([
            ['2026-11-02', '2 Nov'],
            ['2026-11-09', '9 Nov'],
            ['2026-11-16', '16 Nov'],
        ]);
        expect(marks[0].left).toBeCloseTo(3 * DAY);
    });
});

describe('dayMarks', () => {
    test('has one per day, flagging Mondays', () => {
        const marks = dayMarks(range);
        expect(marks).toHaveLength(21);
        expect(marks[0]).toMatchObject({ key: '2026-10-30', isWeekStart: false });
        expect(marks[0].left).toBeCloseTo(0);
        expect(marks[3]).toMatchObject({ key: '2026-11-02', isWeekStart: true });
        expect(marks[3].left).toBeCloseTo(3 * DAY);
        expect(marks.filter((m) => m.isWeekStart).map((m) => m.key)).toEqual([
            '2026-11-02',
            '2026-11-09',
            '2026-11-16',
        ]);
    });
});

describe('filterCounts', () => {
    test('counts each filter', () => {
        const chores = [
            chore('yesterday', '2026-10-30', '2026-11-02'),
            chore('today', '2026-10-30', '2026-11-03'),
            chore('plus3', '2026-10-30', '2026-11-06'),
            chore('plus4', '2026-10-30', '2026-11-07'),
            chore('never', null, null),
        ];
        expect(filterCounts(chores, TODAY)).toEqual({ all: 5, soon: 2, overdue: 1, never: 1 });
    });
});

describe('timelineBar', () => {
    test('is null for a never-done chore', () => {
        expect(timelineBar(chore('n', null, null), range, TODAY)).toBeNull();
    });

    test('future before dueFrom, spanning the whole dueBy day', () => {
        const bar = timelineBar(chore('f', '2026-11-05', '2026-11-07'), range, TODAY);
        expect(bar.tone).toBe('future');
        expect(bar.left).toBeCloseTo(6 * DAY);
        expect(bar.width).toBeCloseTo(3 * DAY);
        expect(bar).toMatchObject({ cutStart: false, cutEnd: false, tail: null });
    });

    test('open from dueFrom through dueBy', () => {
        expect(timelineBar(chore('o', '2026-11-01', '2026-11-03'), range, TODAY).tone).toBe('open');
    });

    test('late after dueBy with a tail from its end to the middle of today', () => {
        const bar = timelineBar(chore('l', '2026-10-31', '2026-11-01'), range, TODAY);
        expect(bar.tone).toBe('late');
        expect(bar.tail.left).toBeCloseTo(3 * DAY);
        expect(bar.tail.width).toBeCloseTo(1.5 * DAY);
    });

    test('clamps and flags a bar clipped at either side', () => {
        const bar = timelineBar(chore('c', '2026-10-25', '2026-11-25'), range, TODAY);
        expect(bar).toMatchObject({ left: 0, cutStart: true, cutEnd: true, tone: 'open' });
        expect(bar.width).toBeCloseTo(100);
    });

    test('a bar wholly before the range is a one-day stub at the left edge with a tail', () => {
        const bar = timelineBar(chore('p', '2026-10-01', '2026-10-10'), range, TODAY);
        expect(bar).toMatchObject({ left: 0, cutStart: true, cutEnd: false });
        expect(bar.width).toBeCloseTo(DAY);
        expect(bar.tail.left).toBeCloseTo(0);
        expect(bar.tail.width).toBeCloseTo(4.5 * DAY);
    });

    test('a bar wholly after the range is a one-day stub at the right edge', () => {
        const bar = timelineBar(chore('a', '2026-12-01', '2026-12-05'), range, TODAY);
        expect(bar).toMatchObject({ cutStart: false, cutEnd: true, tone: 'future' });
        expect(bar.left).toBeCloseTo(100 - DAY);
        expect(bar.width).toBeCloseTo(DAY);
    });
});
