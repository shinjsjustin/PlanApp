// Google Docs text-color grid; the one source of truth for project-card colors.
const COLUMN_NAMES = ['red berry', 'red', 'orange', 'yellow', 'green', 'cyan', 'cornflower blue', 'blue', 'purple', 'magenta'];

const row = (names, hexes) => names.map((name, i) => ({ name, hex: hexes[i] }));
const shades = (label, hexes) => row(COLUMN_NAMES.map((n) => `${n} ${label}`), hexes.split(' ').map((h) => `#${h}`));

export const PALETTE_ROWS = [
    row(
        ['black', 'dark gray 4', 'dark gray 3', 'dark gray 2', 'dark gray 1', 'gray', 'light gray 1', 'light gray 2', 'light gray 3', 'white'],
        ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff']
    ),
    row(COLUMN_NAMES, ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff']),
    shades('light 3', 'e6b8af f4cccc fce5cd fff2cc d9ead3 d0e0e3 c9daf8 cfe2f3 d9d2e9 ead1dc'),
    shades('light 2', 'dd7e6b ea9999 f9cb9c ffe599 b6d7a8 a2c4c9 a4c2f4 9fc5e8 b4a7d6 d5a6bd'),
    shades('light 1', 'cc4125 e06666 f6b26b ffd966 93c47d 76a5af 6d9eeb 6fa8dc 8e7cc3 c27ba0'),
    shades('dark 1', 'a61c00 cc0000 e69138 f1c232 6aa84f 45818e 3c78d8 3d85c6 674ea7 a64d79'),
    shades('dark 2', '85200c 990000 b45f06 bf9000 38761d 134f5c 1155cc 0b5394 351c75 741b47'),
    shades('dark 3', '5b0f00 660000 783f04 7f6000 274e13 0c343d 1c4587 073763 20124d 4c1130'),
];

const PALETTE_HEXES = new Set(PALETTE_ROWS.flat().map((s) => s.hex));

const linearChannel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => linearChannel(parseInt(hex.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Black text has luminance 0, white has 1; compare the two WCAG contrast ratios.
export const textToneFor = (hex) => {
    const l = luminance(hex);
    const contrastWithBlack = (l + 0.05) / 0.05;
    const contrastWithWhite = 1.05 / (l + 0.05);
    return contrastWithBlack >= contrastWithWhite ? 'dark' : 'light';
};

export const isPaletteColor = (hex) => PALETTE_HEXES.has(hex);
