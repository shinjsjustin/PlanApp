import { api, TOKEN_KEY } from '../lib/api';

const SW_URL = '/sw.js';

const isPushCapable = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const currentSubscription = async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
};

// The browser wants the VAPID key as bytes, the server sends it as base64url.
const keyToBytes = (base64Url) => {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0));
};

const subscribe = async () => {
    const { publicKey } = await api.get('/push/public-key');
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(publicKey),
    });
};

const sendToServer = (subscription) => api.post('/push/subscriptions', subscription.toJSON());

/** 'unsupported' | 'denied' | 'off' | 'on' */
export const pushSupport = async () => {
    if (!isPushCapable()) return 'unsupported';
    if (window.Notification.permission === 'denied') return 'denied';
    if (window.Notification.permission !== 'granted') return 'off';
    return (await currentSubscription()) ? 'on' : 'off';
};

/** Asks permission, subscribes and tells the server. Returns the new state. */
export const turnOnPush = async () => {
    const permission = await window.Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    await sendToServer(await subscribe());
    return 'on';
};

// iOS can silently drop a subscription, so every launch re-asserts it.
export const resubscribeOnLaunch = async () => {
    if (!window.localStorage.getItem(TOKEN_KEY)) return;
    if (!isPushCapable() || window.Notification.permission !== 'granted') return;

    try {
        const subscription = (await currentSubscription()) || (await subscribe());
        await sendToServer(subscription);
    } catch (error) {
        console.error('Could not refresh the push subscription', error);
    }
};

export const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
        await navigator.serviceWorker.register(SW_URL);
    } catch (error) {
        console.error('Could not register the service worker', error);
        return;
    }
    await resubscribeOnLaunch();
};
