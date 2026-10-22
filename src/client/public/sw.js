const DEFAULT_TITLE = 'ShinPlan';
const DEFAULT_URL = '/reminders';
const ICON = '/logo192.png';

// Only same-origin paths are followed; anything else falls back to the reminders page.
const safeUrl = (url) => {
    if (typeof url !== 'string') return DEFAULT_URL;
    try {
        const parsed = new URL(url, self.location.origin);
        if (parsed.origin !== self.location.origin) return DEFAULT_URL;
        return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) {
        return DEFAULT_URL;
    }
};

const readPayload = (event) => {
    try {
        const payload = event.data ? event.data.json() : null;
        return payload && typeof payload === 'object' ? payload : {};
    } catch (e) {
        return {};
    }
};

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    const { title, body, url } = readPayload(event);
    event.waitUntil(
        self.registration.showNotification(title || DEFAULT_TITLE, {
            body: body || '',
            icon: ICON,
            data: { url: safeUrl(url) },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = safeUrl(event.notification.data && event.notification.data.url);
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
            if (windows.length === 0) return self.clients.openWindow(url);
            const focused = await windows[0].focus();
            return (focused || windows[0]).navigate(url);
        })
    );
});
