'use strict';

const { listFiles, readFile } = require('../../src/lib/google/driveApi');

const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
});
const textResponse = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const MAX_BYTES = 1048576;

const meta = (overrides) => ({
    id: 'f1',
    name: 'Notes',
    mimeType: 'text/plain',
    modifiedTime: '2026-03-01T00:00:00.000Z',
    size: '5',
    ...overrides,
});

let fetchMock;
beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

describe('listFiles', () => {
    it('GETs drive files excluding trash with a Bearer header and returns files and nextPageToken', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { files: [{ id: 'a' }], nextPageToken: 'p2' }));

        const result = await listFiles('tok', { pageToken: 'p1' });

        expect(result).toEqual({ files: [{ id: 'a' }], nextPageToken: 'p2' });
        const [url, options] = fetchMock.mock.calls[0];
        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe(FILES_URL);
        expect(parsed.searchParams.get('q')).toBe('trashed = false');
        expect(parsed.searchParams.get('pageSize')).toBe('50');
        expect(parsed.searchParams.get('orderBy')).toBe('modifiedTime desc');
        expect(parsed.searchParams.get('fields')).toBe('nextPageToken,files(id,name,mimeType,modifiedTime,size)');
        expect(parsed.searchParams.get('pageToken')).toBe('p1');
        expect(options.headers.Authorization).toBe('Bearer tok');
    });

    it('returns nextPageToken null and no pageToken param when absent', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

        const result = await listFiles('tok');

        expect(result).toEqual({ files: [], nextPageToken: null });
        expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has('pageToken')).toBe(false);
    });

    it('adds a fullText clause with backslash and quote escaped', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { files: [] }));

        await listFiles('tok', { search: "it's a\\b" });

        expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('q')).toBe(
            "trashed = false and fullText contains 'it\\'s a\\\\b'"
        );
    });
});

describe('readFile', () => {
    it('exports a Google Doc as text/plain', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta({ mimeType: 'application/vnd.google-apps.document', size: undefined })))
            .mockResolvedValueOnce(textResponse(200, 'doc body'));

        const result = await readFile('tok', 'f/1');

        expect(result).toEqual({
            file: {
                id: 'f1',
                name: 'Notes',
                mimeType: 'application/vnd.google-apps.document',
                modifiedTime: '2026-03-01T00:00:00.000Z',
                size: null,
            },
            content: 'doc body',
            reason: null,
        });
        const metaUrl = new URL(fetchMock.mock.calls[0][0]);
        expect(metaUrl.origin + metaUrl.pathname).toBe(`${FILES_URL}/f%2F1`);
        expect(metaUrl.searchParams.get('fields')).toBe('id,name,mimeType,modifiedTime,size');
        const exportUrl = new URL(fetchMock.mock.calls[1][0]);
        expect(exportUrl.pathname).toBe('/drive/v3/files/f%2F1/export');
        expect(exportUrl.searchParams.get('mimeType')).toBe('text/plain');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
    });

    it('exports a Google Sheet as text/csv', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta({ mimeType: 'application/vnd.google-apps.spreadsheet' })))
            .mockResolvedValueOnce(textResponse(200, 'a,b'));

        const result = await readFile('tok', 'f1');

        expect(result.content).toBe('a,b');
        expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('mimeType')).toBe('text/csv');
    });

    it.each(['text/markdown', 'application/json'])('downloads %s via alt=media with numeric size', async (mimeType) => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta({ mimeType, size: '7' })))
            .mockResolvedValueOnce(textResponse(200, 'content'));

        const result = await readFile('tok', 'f1');

        expect(result.file.size).toBe(7);
        expect(result.content).toBe('content');
        expect(result.reason).toBeNull();
        const url = new URL(fetchMock.mock.calls[1][0]);
        expect(url.pathname).toBe('/drive/v3/files/f1');
        expect(url.searchParams.get('alt')).toBe('media');
    });

    it('gives unsupported with no download for other mime types', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, meta({ mimeType: 'image/png' })));

        const result = await readFile('tok', 'f1');

        expect(result.content).toBeNull();
        expect(result.reason).toBe('unsupported');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('gives too_large with no download when metadata size exceeds the cap', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, meta({ size: String(MAX_BYTES + 1) })));

        const result = await readFile('tok', 'f1');

        expect(result.content).toBeNull();
        expect(result.reason).toBe('too_large');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('gives too_large when downloaded text exceeds the cap in bytes, and allows exactly the cap', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta({ mimeType: 'application/vnd.google-apps.document', size: undefined })))
            .mockResolvedValueOnce(textResponse(200, 'é'.repeat(MAX_BYTES / 2 + 1)));
        expect((await readFile('tok', 'f1')).reason).toBe('too_large');

        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta({ mimeType: 'application/vnd.google-apps.document', size: undefined })))
            .mockResolvedValueOnce(textResponse(200, 'é'.repeat(MAX_BYTES / 2)));
        const ok = await readFile('tok', 'f1');
        expect(ok.reason).toBeNull();
        expect(ok.content).not.toBeNull();
    });
});

describe('error mapping', () => {
    const calls = {
        listFiles: () => listFiles('tok'),
        'readFile metadata': () => readFile('tok', 'f1'),
    };

    it.each([401, 403])('throws 409 Google not connected on %i', async (status) => {
        for (const call of Object.values(calls)) {
            fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
            await expect(call()).rejects.toMatchObject({ status: 409, message: 'Google not connected' });
        }
    });

    it('throws 409 when the content read answers 403', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta()))
            .mockResolvedValueOnce(jsonResponse(403, {}));
        await expect(readFile('tok', 'f1')).rejects.toMatchObject({ status: 409, message: 'Google not connected' });
    });

    it('throws 404 Drive file not found on metadata and content reads', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
        await expect(readFile('tok', 'f1')).rejects.toMatchObject({ status: 404, message: 'Drive file not found' });

        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta()))
            .mockResolvedValueOnce(jsonResponse(404, {}));
        await expect(readFile('tok', 'f1')).rejects.toMatchObject({ status: 404, message: 'Drive file not found' });
    });

    it('throws 502 on other failures', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
        await expect(listFiles('tok')).rejects.toMatchObject({ status: 502 });
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, meta()))
            .mockResolvedValueOnce(jsonResponse(500, {}));
        await expect(readFile('tok', 'f1')).rejects.toMatchObject({ status: 502 });
    });
});
