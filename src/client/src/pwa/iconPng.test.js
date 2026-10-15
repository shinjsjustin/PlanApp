const fs = require('fs');
const path = require('path');
const { drawMark, encodePng } = require('./iconPng');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const pixelAt = (rgba, size, x, y) => {
    const i = (y * size + x) * 4;
    return Array.from(rgba.slice(i, i + 4));
};

describe('committed icon PNGs', () => {
    test.each([
        ['apple-touch-icon.png', 180],
        ['logo192.png', 192],
        ['logo512.png', 512],
        ['favicon.png', 64],
    ])('%s is a %i square PNG', (file, size) => {
        const buf = fs.readFileSync(path.join(PUBLIC_DIR, file));
        expect(Array.from(buf.slice(0, 8))).toEqual(PNG_SIGNATURE);
        expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
        expect(buf.readUInt32BE(16)).toBe(size);
        expect(buf.readUInt32BE(20)).toBe(size);
    });
});

describe('drawMark', () => {
    test('is deterministic', () => {
        expect(Buffer.from(drawMark(64)).equals(Buffer.from(drawMark(64)))).toBe(true);
    });

    test('has a black opaque corner and neon blue pixels', () => {
        const size = 64;
        const rgba = drawMark(size);
        expect(rgba.length).toBe(size * size * 4);
        expect(pixelAt(rgba, size, 0, 0)).toEqual([0, 0, 0, 255]);
        let blue = 0;
        for (let i = 0; i < rgba.length; i += 4) {
            if (rgba[i] === 0 && rgba[i + 1] === 0xd4 && rgba[i + 2] === 0xff) blue++;
        }
        expect(blue).toBeGreaterThan(0);
    });
});

describe('encodePng', () => {
    test('writes an RGBA IHDR and ends with IEND', () => {
        const buf = encodePng(2, 3, new Uint8Array(2 * 3 * 4));
        expect(buf.readUInt32BE(16)).toBe(2);
        expect(buf.readUInt32BE(20)).toBe(3);
        expect(buf[24]).toBe(8);
        expect(buf[25]).toBe(6);
        expect(buf.toString('ascii', buf.length - 8, buf.length - 4)).toBe('IEND');
    });
});
