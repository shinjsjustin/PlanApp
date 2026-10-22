import { cardWidth, ringPositions, ringViewBox, PHONE_LABEL_SCALE } from './ringGeometry';

describe('ringPositions', () => {
    it('puts the first card at the top and spaces four cards a quarter turn apart', () => {
        const pos = ringPositions([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
        const expected = [[300, 75], [525, 300], [300, 525], [75, 300]];
        pos.forEach((p, i) => {
            expect(p.x).toBeCloseTo(expected[i][0], 6);
            expect(p.y).toBeCloseTo(expected[i][1], 6);
        });
        expect(pos[2].card).toEqual({ id: 3 });
    });
});

describe('cardWidth', () => {
    it.each([
        ['ab', 1, 64],
        ['abcde', 1, 5 * 8.6 + 22],
        ['abcdefghijklmnopq', 1, 150],
        ['ab', 1.6, 64 * 1.6],
        ['abcdefghijklmnopq', 1.6, 240],
    ])('%s at scale %s is %s wide', (label, scale, width) => {
        expect(cardWidth(label, scale)).toBeCloseTo(width, 6);
    });
});

describe('ringViewBox', () => {
    it('pads the desktop box by 8', () => {
        expect(ringViewBox(1)).toBe('-8 -2 616 604');
    });

    it('pads the phone box by 53', () => {
        expect(PHONE_LABEL_SCALE).toBe(1.6);
        expect(ringViewBox(PHONE_LABEL_SCALE)).toBe('-53 -13.25 706 626.5');
    });
});
