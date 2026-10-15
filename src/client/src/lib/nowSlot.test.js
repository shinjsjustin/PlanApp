import { slotStartMinutes, msUntilNextSlot } from './nowSlot';

describe('slotStartMinutes', () => {
    it.each([
        [[14, 47], 870],
        [[14, 30, 0], 870],
        [[0, 5], 0],
        [[23, 59], 1410],
    ])('floors %j to %i', ([h, m, s = 0], expected) => {
        expect(slotStartMinutes(new Date(2026, 9, 15, h, m, s))).toBe(expected);
    });
});

describe('msUntilNextSlot', () => {
    it.each([
        [[14, 47, 30], 750000],
        [[14, 30, 0], 1800000],
        [[14, 59, 59], 1000],
    ])('from %j is %i', ([h, m, s], expected) => {
        expect(msUntilNextSlot(new Date(2026, 9, 15, h, m, s))).toBe(expected);
    });

    it('counts milliseconds', () => {
        expect(msUntilNextSlot(new Date(2026, 9, 15, 14, 29, 59, 500))).toBe(500);
    });
});
