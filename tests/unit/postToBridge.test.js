const { postToBridge, DEFAULT_TIMEOUT_MS } = require('../../src/lib/forward/postToBridge');

const URL = 'http://bridge.test/bourne/prompt';

describe('postToBridge', () => {
    let fetchSpy;
    let errorSpy;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch');
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    test('default timeout is 3000', () => {
        expect(DEFAULT_TIMEOUT_MS).toBe(3000);
    });

    test('POSTs JSON with bearer token and resolves ok on 2xx', async () => {
        fetchSpy.mockResolvedValue({ ok: true, status: 202 });
        const result = await postToBridge(URL, 'tok', { a: 1 });
        expect(result).toEqual({ ok: true, status: 202 });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe(URL);
        expect(opts.method).toBe('POST');
        expect(opts.headers.Authorization).toBe('Bearer tok');
        expect(opts.headers['Content-Type']).toBe('application/json');
        expect(opts.body).toBe('{"a":1}');
        expect(opts.signal).toBeDefined();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('resolves ok false with status on non-2xx and logs status only', async () => {
        fetchSpy.mockResolvedValue({ ok: false, status: 500 });
        const result = await postToBridge(URL, 'tok', { secret: 'SECRETBODY' });
        expect(result).toEqual({ ok: false, status: 500 });
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = errorSpy.mock.calls.map((c) => c.join(' ')).join(' ');
        expect(msg).toContain('500');
        expect(msg).not.toContain('SECRETBODY');
    });

    test('resolves status null on network error and logs name only', async () => {
        const err = new TypeError('fetch failed SECRETBODY');
        fetchSpy.mockRejectedValue(err);
        const result = await postToBridge(URL, 'tok', { secret: 'SECRETBODY' });
        expect(result).toEqual({ ok: false, status: null });
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = errorSpy.mock.calls.map((c) => c.join(' ')).join(' ');
        expect(msg).toContain('TypeError');
        expect(msg).not.toContain('SECRETBODY');
    });

    test('resolves status null when fetch is still pending after timeoutMs', async () => {
        fetchSpy.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
        }));
        const result = await postToBridge(URL, 'tok', { secret: 'SECRETBODY' }, { timeoutMs: 50 });
        expect(result).toEqual({ ok: false, status: null });
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = errorSpy.mock.calls.map((c) => c.join(' ')).join(' ');
        expect(msg).not.toContain('SECRETBODY');
    });

    test('resolves even when body cannot be serialized', async () => {
        const body = {};
        body.self = body;
        const result = await postToBridge(URL, 'tok', body);
        expect(result).toEqual({ ok: false, status: null });
    });
});
