const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
const doc = new DOMParser().parseFromString(html, 'text/html');

const metaContent = (name) =>
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content');

describe('index.html install meta', () => {
    it('viewport covers the notch while keeping width and scale', () => {
        const content = metaContent('viewport');
        expect(content).toContain('viewport-fit=cover');
        expect(content).toContain('width=device-width');
        expect(content).toContain('initial-scale=1');
    });

    it.each([
        ['apple-mobile-web-app-capable', 'yes'],
        ['mobile-web-app-capable', 'yes'],
        ['apple-mobile-web-app-status-bar-style', 'black'],
        ['apple-mobile-web-app-title', 'ShinPlan'],
    ])('%s is %s', (name, value) => {
        expect(metaContent(name)).toBe(value);
    });

    it('links a 180x180 apple-touch-icon and the favicon png', () => {
        const touch = doc.querySelector('link[rel="apple-touch-icon"]');
        expect(touch.getAttribute('href')).toBe('%PUBLIC_URL%/apple-touch-icon.png');
        expect(touch.getAttribute('sizes')).toBe('180x180');
        expect(doc.querySelector('link[rel="icon"]').getAttribute('href')).toBe(
            '%PUBLIC_URL%/favicon.png'
        );
    });
});

describe('manifest.json', () => {
    it('launches standalone on a black theme', () => {
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBe('.');
        expect(manifest.theme_color).toBe('#000000');
        expect(manifest.background_color).toBe('#000000');
    });

    it('only names icons that exist in public/', () => {
        const htmlIcons = [...doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')]
            .map((l) => l.getAttribute('href').replace('%PUBLIC_URL%/', ''));
        const names = [...manifest.icons.map((i) => i.src), ...htmlIcons];
        expect(names.length).toBeGreaterThan(0);
        names.forEach((n) => expect(fs.existsSync(path.join(publicDir, n))).toBe(true));
    });
});
