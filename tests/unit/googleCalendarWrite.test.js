'use strict';

const { insertEvent, patchEvent, deleteEvent } = require('../../src/lib/google/calendarApi');

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const BODY = { summary: 'Write' };

let fetchMock;
beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const calls = {
    insert: () => insertEvent('tok', BODY),
    patch: () => patchEvent('tok', 'e1', BODY),
    remove: () => deleteEvent('tok', 'e1'),
};

describe('insertEvent', () => {
    it('POSTs the body to the primary events URL and returns the created event', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'new' }));

        expect(await insertEvent('tok', BODY)).toEqual({ id: 'new' });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(EVENTS_URL);
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer tok');
        expect(JSON.parse(options.body)).toEqual(BODY);
    });
});

describe('patchEvent', () => {
    it('PATCHes the encoded event id and returns the event', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'a/b' }));

        expect(await patchEvent('tok', 'a/b', BODY)).toEqual({ id: 'a/b' });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(`${EVENTS_URL}/a%2Fb`);
        expect(options.method).toBe('PATCH');
        expect(JSON.parse(options.body)).toEqual(BODY);
    });

    it.each([404, 410])('returns null on %i', async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
        expect(await patchEvent('tok', 'e1', BODY)).toBeNull();
    });
});

describe('deleteEvent', () => {
    it('DELETEs the encoded event id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(204, {}));

        await deleteEvent('tok', 'a/b');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(`${EVENTS_URL}/a%2Fb`);
        expect(options.method).toBe('DELETE');
        expect(options.headers.Authorization).toBe('Bearer tok');
    });

    it.each([404, 410])('treats %i as done', async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
        await expect(deleteEvent('tok', 'e1')).resolves.toBeUndefined();
    });
});

describe.each(Object.keys(calls))('%s errors', (name) => {
    it.each([401, 403])('throws the 409 not-connected error on %i', async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
        await expect(calls[name]()).rejects.toMatchObject({ status: 409, message: 'Google not connected' });
    });

    it.each([400, 429, 500])('throws HttpError 502 on %i', async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
        await expect(calls[name]()).rejects.toMatchObject({ status: 502 });
    });
});
