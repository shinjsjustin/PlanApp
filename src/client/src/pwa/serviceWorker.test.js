const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://plan.example.com';

const load = (windows = []) => {
    const handlers = {};
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type, fn) => { handlers[type] = fn; },
        skipWaiting: jest.fn(),
        registration: { showNotification: jest.fn(() => Promise.resolve()) },
        clients: {
            claim: jest.fn(() => Promise.resolve()),
            matchAll: jest.fn(() => Promise.resolve(windows)),
            openWindow: jest.fn(() => Promise.resolve()),
        },
    };
    new Function('self', source)(self);
    return { self, handlers };
};

const dispatch = (handler, event) => {
    const waits = [];
    handler({ ...event, waitUntil: (p) => waits.push(p) });
    return Promise.all(waits);
};

const pushEvent = (data) => ({ data });
const jsonData = (obj) => ({ json: () => obj });

describe('service worker lifecycle', () => {
    it('skips waiting on install', () => {
        const { self, handlers } = load();
        dispatch(handlers.install, {});
        expect(self.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it('claims clients on activate', async () => {
        const { self, handlers } = load();
        await dispatch(handlers.activate, {});
        expect(self.clients.claim).toHaveBeenCalledTimes(1);
    });
});

describe('push', () => {
    it('shows the payload notification inside waitUntil', async () => {
        const { self, handlers } = load();
        const waits = await dispatch(
            handlers.push,
            pushEvent(jsonData({ title: 'Dentist', body: 'In 1 hour', url: '/reminders/5' }))
        );
        expect(waits).toHaveLength(1);
        expect(self.registration.showNotification).toHaveBeenCalledWith('Dentist', {
            body: 'In 1 hour',
            icon: '/logo192.png',
            data: { url: '/reminders/5' },
        });
    });

    it.each([
        ['no data', null],
        ['bad JSON', { json: () => { throw new Error('bad'); } }],
        ['non-object JSON', jsonData('hi')],
    ])('falls back to ShinPlan and /reminders with %s', async (_n, data) => {
        const { self, handlers } = load();
        await dispatch(handlers.push, pushEvent(data));
        expect(self.registration.showNotification).toHaveBeenCalledWith('ShinPlan', {
            body: '',
            icon: '/logo192.png',
            data: { url: '/reminders' },
        });
    });

    it.each([
        ['cross-origin', 'https://evil.example.com/x'],
        ['protocol-relative', '//evil.example.com/x'],
        ['non-string', 42],
        ['missing', undefined],
    ])('uses /reminders when url is %s', async (_n, url) => {
        const { self, handlers } = load();
        await dispatch(handlers.push, pushEvent(jsonData({ title: 'T', body: 'B', url })));
        expect(self.registration.showNotification.mock.calls[0][1].data.url).toBe('/reminders');
    });

    it('keeps a same-origin absolute url as a path', async () => {
        const { self, handlers } = load();
        await dispatch(handlers.push, pushEvent(jsonData({ title: 'T', body: 'B', url: `${ORIGIN}/reminders/9?x=1` })));
        expect(self.registration.showNotification.mock.calls[0][1].data.url).toBe('/reminders/9?x=1');
    });
});

describe('notificationclick', () => {
    const clickEvent = (url) => ({ notification: { close: jest.fn(), data: { url } } });

    it('closes and focuses then navigates an open window', async () => {
        const win = { focus: jest.fn(() => Promise.resolve(win)), navigate: jest.fn(() => Promise.resolve()) };
        const { self, handlers } = load([win]);
        const event = clickEvent('/reminders/5');
        await dispatch(handlers.notificationclick, event);
        expect(event.notification.close).toHaveBeenCalledTimes(1);
        expect(win.focus).toHaveBeenCalledTimes(1);
        expect(win.navigate).toHaveBeenCalledWith('/reminders/5');
        expect(self.clients.openWindow).not.toHaveBeenCalled();
    });

    it('opens a window when none is open', async () => {
        const { self, handlers } = load([]);
        await dispatch(handlers.notificationclick, clickEvent('/reminders/5'));
        expect(self.clients.openWindow).toHaveBeenCalledWith('/reminders/5');
    });

    it('does not follow a cross-origin url', async () => {
        const { self, handlers } = load([]);
        await dispatch(handlers.notificationclick, clickEvent('https://evil.example.com/'));
        expect(self.clients.openWindow).toHaveBeenCalledWith('/reminders');
    });
});
