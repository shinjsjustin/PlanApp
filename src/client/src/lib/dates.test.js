import { completedOnLabel } from './dates';

// The date in the margin of a finished to-do. Short on purpose: it is a
// reminder, not a record.
//
// `now` is injected throughout so these assert a rule rather than today.

const NOW = new Date('2026-08-31T12:00:00.000Z');

/** What the platform would render, so the assertions are about the rule. */
const weekday = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
const dayMonth = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

describe('completedOnLabel', () => {
    test('names the weekday for something finished in the last week', () => {
        // Arrange — two days before `NOW`.
        const completedAt = '2026-08-29T09:00:00.000Z';

        // Act & Assert
        expect(completedOnLabel(completedAt, NOW)).toBe(weekday(completedAt));
    });

    test('names the weekday right up to the seventh day', () => {
        // Arrange — six days back is still inside the window.
        const completedAt = '2026-08-25T12:00:00.000Z';

        // Act & Assert
        expect(completedOnLabel(completedAt, NOW)).toBe(weekday(completedAt));
    });

    // Past a week "Mon" could mean either Monday, so the date is clearer.
    test('gives the date once a week has passed', () => {
        // Arrange — eight days back.
        const completedAt = '2026-08-23T12:00:00.000Z';

        // Act & Assert
        expect(completedOnLabel(completedAt, NOW)).toBe(dayMonth(completedAt));
    });

    test('reads a stamp from the future as recent rather than as a date', () => {
        // Arrange — a clock disagreeing, not a plan.
        const completedAt = '2026-09-01T12:00:00.000Z';

        // Act & Assert
        expect(completedOnLabel(completedAt, NOW)).toBe(weekday(completedAt));
    });

    // A to-do completed before the column existed carries no stamp, and a blank
    // margin is the right answer for it.
    test('has nothing to say about a to-do with no stamp', () => {
        expect(completedOnLabel(null, NOW)).toBeNull();
        expect(completedOnLabel(undefined, NOW)).toBeNull();
        expect(completedOnLabel('', NOW)).toBeNull();
    });

    test('says nothing rather than "Invalid Date" for something unparseable', () => {
        expect(completedOnLabel('not a date', NOW)).toBeNull();
    });

    test('accepts a Date as readily as a string', () => {
        // Arrange
        const completedAt = new Date('2026-08-29T09:00:00.000Z');

        // Act & Assert
        expect(completedOnLabel(completedAt, NOW)).toBe(weekday('2026-08-29T09:00:00.000Z'));
    });
});
