const zlib = require('zlib');

const BLACK = [0, 0, 0, 255];
const NEON_BLUE = [0x00, 0xd4, 0xff, 255];
const MARK_SCALE = 0.6;
const BYTES_PER_PIXEL = 4;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BIT_DEPTH = 8;
const COLOR_TYPE_RGBA = 6;

// Bold letter "P", 5 columns by 7 rows.
const P_BITMAP = [
    '#### ',
    '#####',
    '##  #',
    '#####',
    '#### ',
    '##   ',
    '##   ',
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
};

const encodePng = (width, height, rgba) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = BIT_DEPTH;
    ihdr[9] = COLOR_TYPE_RGBA;
    const rowBytes = width * BYTES_PER_PIXEL;
    const raw = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y++) {
        const start = y * (rowBytes + 1);
        raw[start] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * rowBytes, rowBytes).copy(raw, start + 1);
    }
    return Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
};

const drawMark = (size) => {
    const rgba = new Uint8Array(size * size * BYTES_PER_PIXEL);
    const rows = P_BITMAP.length;
    const cols = P_BITMAP[0].length;
    const cell = Math.max(1, Math.floor((size * MARK_SCALE) / rows));
    const left = Math.floor((size - cols * cell) / 2);
    const top = Math.floor((size - rows * cell) / 2);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const row = Math.floor((y - top) / cell);
            const col = Math.floor((x - left) / cell);
            const isInk = y >= top && x >= left && row < rows && col < cols && P_BITMAP[row][col] === '#';
            rgba.set(isInk ? NEON_BLUE : BLACK, (y * size + x) * BYTES_PER_PIXEL);
        }
    }
    return rgba;
};

module.exports = { encodePng, drawMark };
