import {
    INITIAL_SCROLL_MINUTES,
    PX_PER_SLOT_MIN,
    SLOTS_PER_DAY,
    clampDuration,
    clampStart,
    createDayGeometry,
    formatTime,
    hourLabels,
    snapToSlot,
} from './scheduleGeometry';
import { DAY_MINUTES } from './schedule';

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

const NON_NUMBERS = [...COERCIBLE_NON_NUMBERS, ...NOT_A_NUMBER];

/**
 * What every clamp in this module owes a non-number: hand it straight back.
 *
 * `toBe` is `Object.is`, so this holds for `NaN` too, and it is a stronger claim
 * than "the result is not finite" — it says nothing was manufactured *and*
 * nothing was substituted. Each function asserts it under its own heading, so a
 * refactor that deletes one block cannot quietly leave another's contract
 * defended somewhere else.
 *
 * The first assertion is implied by the second for every value in the tables, so
 * it cannot fail on any input we currently pass. It is kept because it guards the
 * *tables* rather than the functions: a finite number added to either list by
 * mistake would sail through `toBe` and be silently pointless, and this is what
 * catches that.
 */
const expectPassedThrough = (actual, value) => {
    expect(Number.isFinite(actual)).toBe(false);
    expect(actual).toBe(value);
};

describe('scheduleGeometry constants', () => {
    test('a day is 48 slots of 24px, and opens at 06:00', () => {
        // Literals, not `SLOTS_PER_DAY * PX_PER_SLOT_MIN`. Restating the
        // definition cannot fail for any scale, and every other assertion in
        // this file is expressed in terms of the scale itself — so the whole
        // calendar could be drawn at the wrong size with the suite green. These
        // are also the two numbers the module's own comments claim (48px an
        // hour, a 1152px column), and Task 16 hardcodes the same 24 in its own
        // rect fixtures — where a scale change would surface as a drag bug
        // rather than as this.
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        expect(SLOTS_PER_DAY).toBe(48);
        expect(PX_PER_SLOT_MIN).toBe(24);
        expect(geometry.dayHeightPx).toBe(1152);
        expect(INITIAL_SCROLL_MINUTES).toBe(360);
    });
});

describe('createDayGeometry: minutesToPx / pxToMinutes', () => {
    test('round-trips a slot', () => {
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        expect(geometry.minutesToPx(30)).toBe(PX_PER_SLOT_MIN);
        expect(geometry.pxToMinutes(PX_PER_SLOT_MIN)).toBe(30);
    });

    test('round-trips a whole day', () => {
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        expect(geometry.minutesToPx(1440)).toBe(geometry.dayHeightPx);
        expect(geometry.pxToMinutes(geometry.dayHeightPx)).toBe(1440);
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

    test.each(NON_NUMBERS)(
        'passes %s through rather than snapping it to a slot',
        (unusedName, value) => {
            expectPassedThrough(snapToSlot(value), value);
        }
    );
});

describe('clampStart', () => {
    test('keeps a start on the grid and inside the day', () => {
        expect(clampStart(-90)).toBe(0);
        expect(clampStart(545)).toBe(540);
        expect(clampStart(99999)).toBe(1410);
    });

    test.each(NON_NUMBERS)(
        'passes %s through rather than inventing a start from it',
        (unusedName, value) => {
            // `clampStart` bounds with `Math.min`/`Math.max`, which coerce just
            // as `/` does — guarding the snap alone is not enough. Unguarded,
            // `null` lands at midnight and `true` lands at 00:01, a start off the
            // grid that no gesture could ever have produced.
            expectPassedThrough(clampStart(value), value);
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

    test.each(NON_NUMBERS)(
        'passes %s through rather than inventing a duration from it',
        (unusedName, value) => {
            expectPassedThrough(clampDuration(value), value);
        }
    );
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

describe('createDayGeometry', () => {
    test('converts minutes to pixels at the given scale', () => {
        // Arrange
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        // Act & Assert — one slot is one slot's worth of pixels
        expect(geometry.minutesToPx(30)).toBe(PX_PER_SLOT_MIN);
        expect(geometry.minutesToPx(60)).toBe(PX_PER_SLOT_MIN * 2);
    });

    test('stretches with the scale', () => {
        // Arrange
        const stretched = createDayGeometry(PX_PER_SLOT_MIN * 2);

        // Act & Assert
        expect(stretched.minutesToPx(30)).toBe(PX_PER_SLOT_MIN * 2);
    });

    test('round-trips minutes through pixels at any scale', () => {
        // Arrange
        const scales = [PX_PER_SLOT_MIN, 31, 48.5];

        // Act & Assert
        scales.forEach((pxPerSlot) => {
            const geometry = createDayGeometry(pxPerSlot);

            expect(geometry.pxToMinutes(geometry.minutesToPx(450))).toBeCloseTo(450);
        });
    });

    test('a day is exactly the scale times the number of slots', () => {
        // Arrange
        const geometry = createDayGeometry(40);

        // Act & Assert
        expect(geometry.dayHeightPx).toBe(40 * SLOTS_PER_DAY);
        expect(geometry.minutesToPx(DAY_MINUTES)).toBe(geometry.dayHeightPx);
    });

    test('carries its own scale, so callers can compare two', () => {
        // Act & Assert
        expect(createDayGeometry(37).pxPerSlot).toBe(37);
    });
});

describe('PX_PER_SLOT_MIN', () => {
    test('is the scale the calendar has always drawn at', () => {
        // 48px an hour reads comfortably, and the page never goes below it:
        // more hours beats a squeezed day (design 2026-09-16, decision 10).
        expect(PX_PER_SLOT_MIN).toBe(24);
    });
});
