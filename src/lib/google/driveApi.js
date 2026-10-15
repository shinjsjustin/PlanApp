'use strict';

const { HttpError } = require('../httpError');
const { googleNotConnected } = require('./errors');

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const PAGE_SIZE = 50;
const MAX_CONTENT_BYTES = 1048576;
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size';
const DOC_MIME = 'application/vnd.google-apps.document';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

// Read-only: every call is a GET. 401/403 means reconnect.
const get = async (accessToken, url) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401 || response.status === 403) throw googleNotConnected();
    if (response.status === 404) throw new HttpError(404, 'Drive file not found');
    if (!response.ok) throw new HttpError(502, 'Google Drive request failed');
    return response;
};

const escapeQueryString = (value) => value.replace(/[\\']/g, '\\$&');

const listFiles = async (accessToken, { search, pageToken } = {}) => {
    const q = search
        ? `trashed = false and fullText contains '${escapeQueryString(search)}'`
        : 'trashed = false';
    const params = new URLSearchParams({
        q,
        pageSize: String(PAGE_SIZE),
        orderBy: 'modifiedTime desc',
        fields: `nextPageToken,files(${FILE_FIELDS})`,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await (await get(accessToken, `${FILES_URL}?${params}`)).json();
    return { files: page.files || [], nextPageToken: page.nextPageToken || null };
};

// The URL that returns this file's text, or null when its type can't be read.
const contentUrl = (baseUrl, mimeType) => {
    if (mimeType === DOC_MIME) return `${baseUrl}/export?mimeType=text/plain`;
    if (mimeType === SHEET_MIME) return `${baseUrl}/export?mimeType=text/csv`;
    if (mimeType.startsWith('text/') || mimeType === 'application/json') return `${baseUrl}?alt=media`;
    return null;
};

const readFile = async (accessToken, id) => {
    const baseUrl = `${FILES_URL}/${encodeURIComponent(id)}`;
    const metadata = await (await get(accessToken, `${baseUrl}?fields=${FILE_FIELDS}`)).json();
    const file = {
        id: metadata.id,
        name: metadata.name,
        mimeType: metadata.mimeType,
        modifiedTime: metadata.modifiedTime,
        size: metadata.size === undefined ? null : Number(metadata.size),
    };
    const withoutContent = (reason) => ({ file, content: null, reason });

    const url = contentUrl(baseUrl, file.mimeType);
    if (!url) return withoutContent('unsupported');
    if (file.size !== null && file.size > MAX_CONTENT_BYTES) return withoutContent('too_large');

    const content = await (await get(accessToken, url)).text();
    if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) return withoutContent('too_large');
    return { file, content, reason: null };
};

module.exports = { listFiles, readFile };
