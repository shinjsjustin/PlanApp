import { api, TOKEN_KEY } from '../lib/api';
import { pushSupport, turnOnPush, resubscribeOnLaunch, registerServiceWorker } from './push';

jest.mock('../lib/api', () => ({
    TOKEN_KEY: 'token',
    api: { get: jest.fn(), post: jest.fn() },
}));

// base64url of bytes [251, 255, 191] is '-_-_' (exercises the - and _ alphabet)
const KEY = '-_-_';
const KEY_BYTES = [251, 255, 191];
const SUB_JSON = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } };

let pushManager;
let register;
let permission;
let requestPermission;

const makeSub = () => ({ toJSON: () => SUB_JSON });

const stub = ({ sw = true, pm = true, notif = true } = {}) => {
    if (sw) {
        Object.defineProperty(global.navigator, 'serviceWorker', {
            configurable: true,
            value: { register, ready: Promise.resolve({ pushManager }) },
        });
    } else {
        delete global.navigator.serviceWorker;
    }
    if (pm) window.PushManager = function PushManager() {}; else delete window.PushManager;
    if (notif) window.Notification = { get permission() { return permission; }, requestPermission };
    else delete window.Notification;
};

beforeEach(() => {
    jest.resetAllMocks();
    window.localStorage.clear();
    permission = 'default';
    requestPermission = jest.fn(async () => 'granted');
    register = jest.fn().mockResolvedValue({});
    pushManager = { getSubscription: jest.fn().mockResolvedValue(null), subscribe: jest.fn().mockResolvedValue(makeSub()) };
    api.get.mockResolvedValue({ publicKey: KEY });
    api.post.mockResolvedValue({});
    stub();
});

describe('pushSupport', () => {
    it.each([
        ['serviceWorker missing', { sw: false }],
        ['PushManager missing', { pm: false }],
        ['Notification missing', { notif: false }],
    ])('is unsupported when %s', async (_n, opts) => {
        stub(opts);
        expect(await pushSupport()).toBe('unsupported');
    });

    it('is denied when permission is denied', async () => {
        permission = 'denied';
        expect(await pushSupport()).toBe('denied');
    });

    it('is off when granted but not subscribed', async () => {
        permission = 'granted';
        expect(await pushSupport()).toBe('off');
    });

    it('is off when permission has not been asked', async () => {
        expect(await pushSupport()).toBe('off');
    });

    it('is on when granted and subscribed', async () => {
        permission = 'granted';
        pushManager.getSubscription.mockResolvedValue(makeSub());
        expect(await pushSupport()).toBe('on');
    });
});

describe('turnOnPush', () => {
    it('subscribes with the decoded server key and posts the subscription', async () => {
        const result = await turnOnPush();

        expect(requestPermission).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/push/public-key');
        const options = pushManager.subscribe.mock.calls[0][0];
        expect(options.userVisibleOnly).toBe(true);
        expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
        expect(Array.from(options.applicationServerKey)).toEqual(KEY_BYTES);
        expect(api.post).toHaveBeenCalledWith('/push/subscriptions', SUB_JSON);
        expect(result).toBe('on');
    });

    it('does not subscribe or post when permission is denied', async () => {
        requestPermission.mockResolvedValue('denied');

        expect(await turnOnPush()).toBe('denied');
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalled();
    });
});

describe('resubscribeOnLaunch', () => {
    beforeEach(() => {
        window.localStorage.setItem(TOKEN_KEY, 'jwt');
        permission = 'granted';
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('does nothing without a token', async () => {
        window.localStorage.clear();
        await resubscribeOnLaunch();
        expect(pushManager.getSubscription).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('does nothing unless permission is granted', async () => {
        permission = 'default';
        await resubscribeOnLaunch();
        expect(api.post).not.toHaveBeenCalled();
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });

    it('reuses an existing subscription', async () => {
        pushManager.getSubscription.mockResolvedValue(makeSub());
        await resubscribeOnLaunch();
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(api.post).toHaveBeenCalledWith('/push/subscriptions', SUB_JSON);
    });

    it('recreates a dropped subscription and posts it', async () => {
        await resubscribeOnLaunch();
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith('/push/subscriptions', SUB_JSON);
    });

    it('reports failures with console.error and never throws', async () => {
        const boom = new Error('down');
        api.post.mockRejectedValue(boom);
        await expect(resubscribeOnLaunch()).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(expect.any(String), boom);
    });
});

describe('registerServiceWorker', () => {
    it('registers /sw.js then resubscribes', async () => {
        window.localStorage.setItem(TOKEN_KEY, 'jwt');
        permission = 'granted';
        await registerServiceWorker();
        expect(register).toHaveBeenCalledWith('/sw.js');
        expect(api.post).toHaveBeenCalledWith('/push/subscriptions', SUB_JSON);
    });

    it('does nothing when service workers are unsupported', async () => {
        stub({ sw: false });
        await expect(registerServiceWorker()).resolves.toBeUndefined();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('reports a registration failure with console.error', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const boom = new Error('nope');
        register.mockRejectedValue(boom);
        await expect(registerServiceWorker()).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(expect.any(String), boom);
    });
});
