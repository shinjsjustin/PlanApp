import {
    DAY_HEIGHT_PX,
    INITIAL_SCROLL_MINUTES,
    PX_PER_SLOT,
    SLOTS_PER_DAY,
    clampDuration,
    clampStart,
    formatTime,
    hourLabels,
    minutesToPx,
    pxToMinutes,
    snapToSlot,
} from './scheduleGeometry';

/**
 * The shapes that break a `ToNumber` boundary are the ones that coerce
 * *successfully*, not the ones that produce `NaN`. Every value here becomes a
 * plausible number under `/`, `Math.min` or `Math.max` — `null` and `''` become
 * `0`, `true` becomes `1`, `'60'` becomes `60` — so a clamp that lets one
 * through hands a real-looking booking to the code that saves it. Asserting only
 * over `NaN` would pass against a completely unguarded function.
 */
const COERCIBLE_NON_NUMBERS = [
    ['null', null],
    ['true', true],
    ['false', false],
    ['an empty string', ''],
    ['an empty array', []],
    ['a numeric string', '60'],
    ['an exponent string', '1e3'],
    ['a one-number array', [45]],
    ['Infinity', Infinity],
];

/** These already fail to coerce. Kept because they must not start coercing. */
const NOT_A_NUMBER = [
    ['NaN', NaN],
    ['undefined', undefined],
    ['a word', 'an hour'],
    ['an object', {}],
];

describe('scheduleGeometry constants', () => {
    test('a day is 48 slots tall and opens at 06:00', () => {
        expect(SLOTS_PER_DAY).toBe(48);
        expect(DAY_HEIGHT_PX).toBe(SLOTS_PER_DAY * PX_PER_SLOT);
        expect(INITIAL_SCROLL_MINUTES).toBe(360);
    });
});

describe('minutesToPx / pxToMinutes', () => {
    test('round-trips a slot', () => {
        expect(minutesToPx(30)).toBe(PX_PER_SLOT);
        expect(pxToMinutes(PX_PER_SLOT)).toBe(30);
    });

    test('round-trips a whole day', () => {
        expect(minutesToPx(1440)).toBe(DAY_HEIGHT_PX);
        expect(pxToMinutes(DAY_HEIGHT_PX)).toBe(1440);
    });
});

describe('snapToSlot', () => {
    test('snaps to the nearest half hour', () => {
        expect(snapToSlot(0)).toBe(0);
        expect(snapToSlot(14)).toBe(0);
        expect(snapToSlot(15)).toBe(30);
        expect(snapToSlot(44)).toBe(30);
        expect(snapToSlot(545)).toBe(540);
        expect(snapToSlot(555)).toBe(570);
    });

    test.each([...COERCIBLE_NON_NUMBERS, ...NOT_A_NUMBER])(
        'passes %s through rather than snapping it to a slot',
        (unusedName, value) => {
            expect(Number.isFinite(snapToSlot(value))).toBe(false);
        }
    );
});

describe('clampStart', () => {
    test('keeps a start on the grid and inside the day', () => {
        expect(clampStart(-90)).toBe(0);
        expect(clampStart(545)).toBe(540);
        expect(clampStart(99999)).toBe(1410);
    });

    test.each([...COERCIBLE_NON_NUMBERS, ...NOT_A_NUMBER])(
        'passes %s through rather than inventing a start from it',
        (unusedName, value) => {
            // `clampStart` bounds with `Math.min`/`Math.max`, which coerce just
            // as `/` does — guarding the snap alone is not enough. Unguarded,
            // `null` lands at midnight and `true` lands at 00:01, a start off the
            // grid that no gesture could ever have produced.
            expect(Number.isFinite(clampStart(value))).toBe(false);
        }
    );
});

describe('clampDuration', () => {
    test('never goes below one slot', () => {
        expect(clampDuration(0)).toBe(30);
        expect(clampDuration(-60)).toBe(30);
    });

    test('never exceeds a whole day', () => {
        expect(clampDuration(99999)).toBe(1440);
    });

    test('allows a duration that will spill past midnight', () => {
        // The clamp is about what an item may *be*, not where it may sit —
        // running past 24:00 is what the spill exists to resolve.
        expect(clampDuration(720)).toBe(720);
    });

    test('lands a duration on the grid', () => {
        // The bounds are only half of the clamp. A duration the pointer produced
        // between two slots has to snap like a start does, or a resize ghost
        // would size itself off the grid it is drawn on.
        expect(clampDuration(44)).toBe(30);
        expect(clampDuration(545)).toBe(540);
    });

    test.each(COERCIBLE_NON_NUMBERS)(
        'passes %s through rather than inventing a duration from it',
        (unusedName, value) => {
            // Arrange + Act
            const duration = clampDuration(value);

            // Assert
            expect(Number.isFinite(duration)).toBe(false);
            expect(duration).toBe(value);
        }
    );

    test.each(NOT_A_NUMBER)('leaves %s alone', (unusedName, value) => {
        expect(Number.isFinite(clampDuration(value))).toBe(false);
    });
});

describe('formatTime', () => {
    test('renders a zero-padded 24-hour clock', () => {
        expect(formatTime(0)).toBe('00:00');
        expect(formatTime(540)).toBe('09:00');
        expect(formatTime(570)).toBe('09:30');
        expect(formatTime(1410)).toBe('23:30');
    });

    test('renders the end of a day as 24:00, not 00:00', () => {
        expect(formatTime(1440)).toBe('24:00');
    });
});

describe('hourLabels', () => {
    test('gives 24 labels, one per hour', () => {
        const labels = hourLabels();

        expect(labels).toHaveLength(24);
        expect(labels[0]).toEqual({ minutes: 0, label: '00:00' });
        expect(labels[23]).toEqual({ minutes: 1380, label: '23:00' });
    });
});
