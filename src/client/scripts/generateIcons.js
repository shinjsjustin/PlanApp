const fs = require('fs');
const path = require('path');
const { drawMark, encodePng } = require('../src/pwa/iconPng');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ICONS = {
    'apple-touch-icon.png': 180,
    'logo192.png': 192,
    'logo512.png': 512,
    'favicon.png': 64,
};

Object.entries(ICONS).forEach(([file, size]) => {
    fs.writeFileSync(path.join(PUBLIC_DIR, file), encodePng(size, size, drawMark(size)));
});
