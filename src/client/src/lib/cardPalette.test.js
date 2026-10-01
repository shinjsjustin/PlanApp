import { PALETTE_ROWS, textToneFor, isPaletteColor } from './cardPalette';

const allSwatches = PALETTE_ROWS.flat();

describe('PALETTE_ROWS', () => {
    it('has 8 rows of 10 named swatches', () => {
        expect(PALETTE_ROWS).toHaveLength(8);
        PALETTE_ROWS.forEach((row) => expect(row).toHaveLength(10));
        allSwatches.forEach((s) => expect(s.name).toMatch(/\S/));
    });

    it('has 80 unique lowercase 6-digit hexes including black and white', () => {
        const hexes = allSwatches.map((s) => s.hex);
        hexes.forEach((h) => expect(h).toMatch(/^#[0-9a-f]{6}$/));
        expect(new Set(hexes).size).toBe(80);
        expect(hexes).toContain('#000000');
        expect(hexes).toContain('#ffffff');
    });

    it('starts with grays black to white and bright colors red berry to magenta', () => {
        expect(PALETTE_ROWS[0][0].hex).toBe('#000000');
        expect(PALETTE_ROWS[0][9].hex).toBe('#ffffff');
        expect(PALETTE_ROWS[1][0].hex).toBe('#980000');
        expect(PALETTE_ROWS[1][9].hex).toBe('#ff00ff');
    });
});

describe('textToneFor', () => {
    it.each([
        ['#ffffff', 'dark'],
        ['#ffff00', 'dark'],
        ['#999999', 'dark'],
        ['#000000', 'light'],
        ['#0000ff', 'light'],
        ['#980000', 'light'],
        ['#666666', 'light'],
    ])('returns the higher-contrast tone for %s', (hex, tone) => {
        expect(textToneFor(hex)).toBe(tone);
    });
});

describe('isPaletteColor', () => {
    it('accepts every palette hex', () => {
        allSwatches.forEach((s) => expect(isPaletteColor(s.hex)).toBe(true));
    });

    it('rejects a hex outside the palette', () => {
        expect(isPaletteColor('#123456')).toBe(false);
    });
});
