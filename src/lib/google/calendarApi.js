'use strict';

const { HttpError } = require('../httpError');
const { googleNotConnected } = require('./errors');

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const PAGE_SIZE = 2500;

const fetchPage = async (accessToken, params) => {
    const response = await fetch(`${EVENTS_URL}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) throw googleNotConnected();
    if (!response.ok) throw new HttpError(502, 'Google Calendar request failed');
    return response.json();
};

const GONE_STATUSES = [404, 410];

// Shared by the writes: 401/403 means reconnect, a gone event is the caller's to interpret.
const sendWrite = async (accessToken, url, method, body) => {
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(body && { 'Content-Type': 'application/json' }),
        },
        ...(body && { body: JSON.stringify(body) }),
    });
    if (response.status === 401 || response.status === 403) throw googleNotConnected();
    if (GONE_STATUSES.includes(response.status)) return null;
    if (!response.ok) throw new HttpError(502, 'Google Calendar request failed');
    return response;
};

const eventUrl = (eventId) => `${EVENTS_URL}/${encodeURIComponent(eventId)}`;

const insertEvent = async (accessToken, body) => {
    const response = await sendWrite(accessToken, EVENTS_URL, 'POST', body);
    // A 404/410 on create is not a state Google produces; treat it as a failure.
    if (!response) throw new HttpError(502, 'Google Calendar request failed');
    return response.json();
};

// Null when the event was deleted in Google, so the caller can drop its mapping.
const patchEvent = async (accessToken, eventId, body) => {
    const response = await sendWrite(accessToken, eventUrl(eventId), 'PATCH', body);
    return response ? response.json() : null;
};

// An event already gone is the outcome we wanted.
const deleteEvent = async (accessToken, eventId) => {
    await sendWrite(accessToken, eventUrl(eventId), 'DELETE');
};

// Every event on the primary calendar in the window, recurrences expanded.
const listPrimaryEvents = async (accessToken, { timeMin, timeMax }) => {
    const events = [];
    let pageToken;
    do {
        const params = new URLSearchParams({
            singleEvents: 'true',
            maxResults: String(PAGE_SIZE),
            timeMin,
            timeMax,
        });
        if (pageToken) params.set('pageToken', pageToken);
        const page = await fetchPage(accessToken, params);
        events.push(...(page.items || []));
        pageToken = page.nextPageToken;
    } while (pageToken);
    return events;
};

module.exports = { listPrimaryEvents, insertEvent, patchEvent, deleteEvent };
