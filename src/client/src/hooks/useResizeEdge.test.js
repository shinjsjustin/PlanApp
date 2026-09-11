import { rectFor } from './useResizeEdge';

describe('rectFor', () => {
    const item = { todoId: 7, startMinutes: 540, durationMinutes: 60 };

    test('the bottom edge changes only the duration', () => {
        expect(rectFor(item, { edge: 'bottom', deltaMinutes: 60, floor: 0 })).toEqual({
            startMinutes: 540,
            durationMinutes: 120,
        });
    });

    test('the bottom edge stops at one slot', () => {
        expect(rectFor(item, { edge: 'bottom', deltaMinutes: -600, floor: 0 })).toEqual({
            startMinutes: 540,
            durationMinutes: 30,
        });
    });

    test('the bottom edge may pass midnight, for the spill to resolve', () => {
        const late = { todoId: 7, startMinutes: 1380, durationMinutes: 60 };

        expect(rectFor(late, { edge: 'bottom', deltaMinutes: 120, floor: 0 })).toEqual({
            startMinutes: 1380,
            durationMinutes: 180,
        });
    });

    test('the top edge moves the start and keeps the end fixed', () => {
        expect(rectFor(item, { edge: 'top', deltaMinutes: -60, floor: 0 })).toEqual({
            startMinutes: 480,
            durationMinutes: 120,
        });
    });

    test('the top edge clamps at the item above and never pushes it', () => {
        // Arrange — the item above ends at 10:00
        expect(rectFor(item, { edge: 'top', deltaMinutes: -600, floor: 600 })).toEqual({
            startMinutes: 600,
            durationMinutes: 30,
        });
    });

    test('the top edge cannot swallow its own end', () => {
        expect(rectFor(item, { edge: 'top', deltaMinutes: 600, floor: 0 })).toEqual({
            startMinutes: 570,
            durationMinutes: 30,
        });
    });
});
