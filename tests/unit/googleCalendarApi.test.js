'use strict';

const { listPrimaryEvents } = require('../../src/lib/google/calendarApi');

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const WINDOW = { timeMin: '2026-03-01T00:00:00.000Z', timeMax: '2026-03-05T00:00:00.000Z' };

let fetchMock;
beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

describe('listPrimaryEvents', () => {
    it('GETs primary events with singleEvents, window and a Bearer header', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'a' }] }));

        const items = await listPrimaryEvents('tok', WINDOW);

        expect(items).toEqual([{ id: 'a' }]);
        const [url, options] = fetchMock.mock.calls[0];
        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events'
        );
        expect(parsed.searchParams.get('singleEvents')).toBe('true');
        expect(parsed.searchParams.get('maxResults')).toBe('2500');
        expect(parsed.searchParams.get('timeMin')).toBe(WINDOW.timeMin);
        expect(parsed.searchParams.get('timeMax')).toBe(WINDOW.timeMax);
        expect(parsed.searchParams.has('pageToken')).toBe(false);
        expect(options.headers.Authorization).toBe('Bearer tok');
    });

    it('follows nextPageToken and returns every page', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'a' }], nextPageToken: 'p2' }))
            .mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'b' }] }));

        const items = await listPrimaryEvents('tok', WINDOW);

        expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('pageToken')).toBe('p2');
    });

    it('returns an empty list when a page has no items', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
        expect(await listPrimaryEvents('tok', WINDOW)).toEqual([]);
    });

    it.each([401, 403])('throws the 409 not-connected error on %i', async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
        await expect(listPrimaryEvents('tok', WINDOW)).rejects.toMatchObject({
            status: 409,
            message: 'Google not connected',
        });
    });

    it.each([404, 429, 500])('throws HttpError 502 on %i', async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
        await expect(listPrimaryEvents('tok', WINDOW)).rejects.toMatchObject({ status: 502 });
    });
});
