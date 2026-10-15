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

module.exports = { listPrimaryEvents };
